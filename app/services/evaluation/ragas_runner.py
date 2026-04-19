"""
RAGAS 评估引擎 — 计算 faithfulness / answer_relevancy / context_recall

三维评估指标:
  - Faithfulness: 答案中每个事实是否有检索上下文支撑（防幻觉）
  - Answer Relevancy: 答案是否真正回答了用户问题
  - Context Recall: 检索上下文是否覆盖了回答所需的全部信息
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime

from app.services.evaluation.dataset_builder import EvalSample
from app.services.llm import complete_chat

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


async def run_evaluation(
    samples: list[EvalSample],
    run_type: str = "daily",
) -> EvalRunResult:
    """
    执行 RAGAS 评估。

    优先使用 ragas 库；如果未安装，回退到 LLM-as-Judge 简易评估。
    """
    from app.core.config import get_settings
    settings = get_settings()

    try:
        return await _run_with_ragas(samples, run_type, settings.ANTHROPIC_MODEL)
    except ImportError:
        logger.warning("ragas 库未安装，回退到 LLM-as-Judge 简易评估")
        return await _run_with_llm_judge(samples, run_type, settings.ANTHROPIC_MODEL)


async def _run_with_ragas(
    samples: list[EvalSample],
    run_type: str,
    model_version: str,
) -> EvalRunResult:
    """使用 RAGAS 库执行评估"""
    from ragas import evaluate
    from ragas.metrics import faithfulness, answer_relevancy, context_recall
    from datasets import Dataset

    # 构建 RAGAS 格式的数据集
    data = {
        "question": [s.query for s in samples],
        "answer": [s.answer for s in samples],
        "contexts": [s.contexts for s in samples],
        "ground_truth": [s.ground_truth or s.answer for s in samples],
    }
    dataset = Dataset.from_dict(data)

    # 执行评估
    result = evaluate(
        dataset,
        metrics=[faithfulness, answer_relevancy, context_recall],
    )

    # 解析结果
    eval_samples = []
    df = result.to_pandas()
    for idx, row in df.iterrows():
        eval_samples.append(EvalResult(
            query=samples[idx].query if idx < len(samples) else "",
            faithfulness=float(row.get("faithfulness", 0)),
            answer_relevancy=float(row.get("answer_relevancy", 0)),
            context_recall=float(row.get("context_recall", 0)),
        ))

    return EvalRunResult(
        run_id=str(uuid.uuid4())[:8],
        run_type=run_type,
        dataset_size=len(samples),
        faithfulness_avg=float(result.get("faithfulness", 0)),
        relevancy_avg=float(result.get("answer_relevancy", 0)),
        recall_avg=float(result.get("context_recall", 0)),
        samples=eval_samples,
        model_version=model_version,
        created_at=datetime.utcnow().isoformat(),
    )


async def _run_with_llm_judge(
    samples: list[EvalSample],
    run_type: str,
    model_version: str,
) -> EvalRunResult:
    """
    回退方案：LLM-as-Judge 简易评估。
    不依赖 ragas 库，直接用配置的 LLM 打分。
    """
    import json

    eval_samples = []
    faith_scores = []
    relev_scores = []
    recall_scores = []

    for sample in samples:
        try:
            prompt = (
                f"请评估以下 RAG 问答的质量，给出三个维度的分数 (0-1)：\n\n"
                f"问题: {sample.query}\n"
                f"答案: {sample.answer[:500]}\n"
                f"检索上下文: {str(sample.contexts)[:500]}\n\n"
                f"评估维度：\n"
                f"1. faithfulness: 答案中的事实是否都有上下文支撑\n"
                f"2. relevancy: 答案是否回答了问题\n"
                f"3. recall: 上下文是否覆盖了所需信息\n\n"
                f'返回 JSON: {{"faithfulness": 0.x, "relevancy": 0.x, "recall": 0.x}}\n'
                f"只返回 JSON。"
            )

            raw = (await complete_chat(prompt, max_tokens=100)).strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            scores = json.loads(raw)
            f = float(scores.get("faithfulness", 0))
            r = float(scores.get("relevancy", 0))
            c = float(scores.get("recall", 0))

            eval_samples.append(EvalResult(
                query=sample.query, faithfulness=f,
                answer_relevancy=r, context_recall=c,
            ))
            faith_scores.append(f)
            relev_scores.append(r)
            recall_scores.append(c)

        except Exception as e:
            logger.warning(f"LLM Judge 评估失败: {e}")
            eval_samples.append(EvalResult(
                query=sample.query, faithfulness=0, answer_relevancy=0,
                context_recall=0, notes=f"评估失败: {str(e)}",
            ))

    n = max(len(faith_scores), 1)
    return EvalRunResult(
        run_id=str(uuid.uuid4())[:8],
        run_type=run_type,
        dataset_size=len(samples),
        faithfulness_avg=sum(faith_scores) / n,
        relevancy_avg=sum(relev_scores) / n,
        recall_avg=sum(recall_scores) / n,
        samples=eval_samples,
        model_version=model_version,
        created_at=datetime.utcnow().isoformat(),
    )
