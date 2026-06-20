"""
RAGAS 评估引擎 — 计算 faithfulness / answer_relevancy / context_recall

三维评估指标:
  - Faithfulness: 答案中每个事实是否有检索上下文支撑（防幻觉）
  - Answer Relevancy: 答案是否真正回答了用户问题
  - Context Recall: 检索上下文是否覆盖了标准答案所需信息（需 ground_truth）
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime

from app.core.config import get_settings
from app.services.evaluation.dataset_builder import EvalSample
from app.services.llm import complete_chat, is_openai_compat_provider

logger = logging.getLogger(__name__)


@dataclass
class EvalResult:
    """单条样本的评估结果"""
    query: str
    faithfulness: float
    answer_relevancy: float
    context_recall: float
    notes: str = ""


@dataclass
class EvalRunResult:
    """整次评估的汇总结果"""
    run_id: str
    run_type: str                    # daily / online / ci
    dataset_size: int
    faithfulness_avg: float
    relevancy_avg: float
    recall_avg: float
    samples: list[EvalResult]
    model_version: str
    created_at: str
    recall_evaluated: bool = False


def get_eval_model_version() -> str:
    settings = get_settings()
    if is_openai_compat_provider():
        return settings.OPENAI_MODEL or "openai-compat"
    return settings.ANTHROPIC_MODEL


def _samples_have_ground_truth(samples: list[EvalSample]) -> bool:
    return bool(samples) and all((s.ground_truth or "").strip() for s in samples)


async def run_evaluation(
    samples: list[EvalSample],
    run_type: str = "daily",
) -> EvalRunResult:
    """
    执行 RAGAS 评估。

    优先使用 ragas 库；如果未安装或执行失败，回退到 LLM-as-Judge 简易评估。
    无 ground_truth 时仅评估 faithfulness + answer_relevancy。
    """
    if not samples:
        return EvalRunResult(
            run_id=str(uuid.uuid4())[:8],
            run_type=run_type,
            dataset_size=0,
            faithfulness_avg=0.0,
            relevancy_avg=0.0,
            recall_avg=0.0,
            samples=[],
            model_version=get_eval_model_version(),
            created_at=datetime.utcnow().isoformat(),
            recall_evaluated=False,
        )

    model_version = get_eval_model_version()
    recall_evaluated = _samples_have_ground_truth(samples)

    try:
        return await _run_with_ragas(samples, run_type, model_version, recall_evaluated)
    except ImportError:
        logger.warning("ragas 库未安装，回退到 LLM-as-Judge 简易评估")
    except Exception as e:
        logger.warning(f"ragas 评估失败，回退到 LLM-as-Judge: {e}")

    return await _run_with_llm_judge(samples, run_type, model_version, recall_evaluated)


async def _run_with_ragas(
    samples: list[EvalSample],
    run_type: str,
    model_version: str,
    recall_evaluated: bool,
) -> EvalRunResult:
    """使用 RAGAS 库执行评估"""
    from datasets import Dataset
    from ragas import evaluate
    from ragas.metrics import answer_relevancy, context_recall, faithfulness

    data: dict = {
        "question": [s.query for s in samples],
        "answer": [s.answer for s in samples],
        "contexts": [s.contexts for s in samples],
    }
    metrics = [faithfulness, answer_relevancy]
    if recall_evaluated:
        data["ground_truth"] = [s.ground_truth for s in samples]
        metrics.append(context_recall)

    dataset = Dataset.from_dict(data)
    result = evaluate(dataset, metrics=metrics)

    eval_samples: list[EvalResult] = []
    df = result.to_pandas()
    for idx, row in df.iterrows():
        eval_samples.append(
            EvalResult(
                query=samples[idx].query if idx < len(samples) else "",
                faithfulness=float(row.get("faithfulness", 0) or 0),
                answer_relevancy=float(row.get("answer_relevancy", 0) or 0),
                context_recall=float(row.get("context_recall", 0) or 0) if recall_evaluated else 0.0,
            )
        )

    recall_avg = float(result.get("context_recall", 0) or 0) if recall_evaluated else 0.0

    return EvalRunResult(
        run_id=str(uuid.uuid4())[:8],
        run_type=run_type,
        dataset_size=len(samples),
        faithfulness_avg=float(result.get("faithfulness", 0) or 0),
        relevancy_avg=float(result.get("answer_relevancy", 0) or 0),
        recall_avg=recall_avg,
        samples=eval_samples,
        model_version=model_version,
        created_at=datetime.utcnow().isoformat(),
        recall_evaluated=recall_evaluated,
    )


async def _run_with_llm_judge(
    samples: list[EvalSample],
    run_type: str,
    model_version: str,
    recall_evaluated: bool,
) -> EvalRunResult:
    """
    回退方案：LLM-as-Judge 简易评估。
    不依赖 ragas 库，直接用配置的 LLM 打分。
    """
    import json

    eval_samples: list[EvalResult] = []
    faith_scores: list[float] = []
    relev_scores: list[float] = []
    recall_scores: list[float] = []

    for sample in samples:
        try:
            if recall_evaluated and sample.ground_truth:
                prompt = (
                    f"请评估以下 RAG 问答的质量，给出三个维度的分数 (0-1)：\n\n"
                    f"问题: {sample.query}\n"
                    f"标准答案: {sample.ground_truth}\n"
                    f"模型答案: {sample.answer[:500]}\n"
                    f"检索上下文: {str(sample.contexts)[:500]}\n\n"
                    f"评估维度：\n"
                    f"1. faithfulness: 模型答案中的事实是否都有上下文支撑\n"
                    f"2. relevancy: 模型答案是否回答了问题\n"
                    f"3. recall: 检索上下文是否覆盖标准答案所需信息\n\n"
                    f'返回 JSON: {{"faithfulness": 0.x, "relevancy": 0.x, "recall": 0.x}}\n'
                    f"只返回 JSON。"
                )
            else:
                prompt = (
                    f"请评估以下 RAG 问答的质量，给出两个维度的分数 (0-1)：\n\n"
                    f"问题: {sample.query}\n"
                    f"答案: {sample.answer[:500]}\n"
                    f"检索上下文: {str(sample.contexts)[:500]}\n\n"
                    f"评估维度：\n"
                    f"1. faithfulness: 答案中的事实是否都有上下文支撑\n"
                    f"2. relevancy: 答案是否回答了问题\n\n"
                    f'返回 JSON: {{"faithfulness": 0.x, "relevancy": 0.x}}\n'
                    f"只返回 JSON。"
                )

            raw = (await complete_chat(prompt, max_tokens=150)).strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            scores = json.loads(raw)
            f = float(scores.get("faithfulness", 0))
            r = float(scores.get("relevancy", scores.get("answer_relevancy", 0)))
            c = float(scores.get("recall", scores.get("context_recall", 0))) if recall_evaluated else 0.0

            eval_samples.append(
                EvalResult(
                    query=sample.query,
                    faithfulness=f,
                    answer_relevancy=r,
                    context_recall=c,
                )
            )
            faith_scores.append(f)
            relev_scores.append(r)
            if recall_evaluated:
                recall_scores.append(c)

        except Exception as e:
            logger.warning(f"LLM Judge 评估失败: {e}")
            eval_samples.append(
                EvalResult(
                    query=sample.query,
                    faithfulness=0,
                    answer_relevancy=0,
                    context_recall=0,
                    notes=f"评估失败: {str(e)}",
                )
            )

    n = max(len(faith_scores), 1)
    recall_n = max(len(recall_scores), 1)
    return EvalRunResult(
        run_id=str(uuid.uuid4())[:8],
        run_type=run_type,
        dataset_size=len(samples),
        faithfulness_avg=sum(faith_scores) / n if faith_scores else 0.0,
        relevancy_avg=sum(relev_scores) / n if relev_scores else 0.0,
        recall_avg=sum(recall_scores) / recall_n if recall_scores else 0.0,
        samples=eval_samples,
        model_version=model_version,
        created_at=datetime.utcnow().isoformat(),
        recall_evaluated=recall_evaluated,
    )
