"""
BGE-M3 三合一 Embedding 服务
同时输出 dense / sparse / colbert 三种向量，单模型完成所有向量类型
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class EmbeddingResult:
    """BGE-M3 三合一 Embedding 输出"""
    dense: np.ndarray          # shape: (1024,)
    sparse: dict[int, float]   # {token_id: weight}  — Qdrant sparse vector 格式
    colbert: np.ndarray | None # shape: (seq_len, 1024) — 用于 ColBERT 精排


class BGEM3Embedder:
    """
    BGE-M3 Embedding 模型封装
    - 使用 FlagEmbedding 库加载模型
    - 支持 batch 编码
    - 输出 dense + sparse + colbert 三种向量
    """

    def __init__(self):
        self._model = None

    def _load_model(self):
        if self._model is not None:
            return

        try:
            from FlagEmbedding import BGEM3FlagModel

            logger.info(f"加载 BGE-M3 模型: {settings.BGE_M3_MODEL_PATH}")
            self._model = BGEM3FlagModel(
                settings.BGE_M3_MODEL_PATH,
                use_fp16=True,
            )
            logger.info("BGE-M3 模型加载完成")
        except ImportError:
            raise ImportError(
                "FlagEmbedding 未安装，请运行: pip install FlagEmbedding"
            )

    def encode(self, texts: list[str], return_colbert: bool = False) -> list[EmbeddingResult]:
        """
        编码文本列表，返回三合一向量

        Args:
            texts: 待编码的文本列表
            return_colbert: 是否返回 ColBERT 向量（占用内存较大，检索时通常不需要）

        Returns:
            List[EmbeddingResult]
        """
        self._load_model()

        output = self._model.encode(
            texts,
            return_dense=True,
            return_sparse=True,
            return_colbert_vecs=return_colbert,
        )

        results = []
        for i in range(len(texts)):
            dense = output["dense_vecs"][i]

            # sparse 向量格式转换 → {token_id: weight}
            sparse_dict = {}
            if "lexical_weights" in output and output["lexical_weights"]:
                raw_sparse = output["lexical_weights"][i]
                if isinstance(raw_sparse, dict):
                    sparse_dict = {int(k): float(v) for k, v in raw_sparse.items()}

            # ColBERT 向量
            colbert = None
            if return_colbert and "colbert_vecs" in output and output["colbert_vecs"] is not None:
                colbert = output["colbert_vecs"][i]

            results.append(EmbeddingResult(
                dense=np.array(dense, dtype=np.float32),
                sparse=sparse_dict,
                colbert=colbert,
            ))

        return results

    def encode_query(self, query: str) -> EmbeddingResult:
        """编码单条查询"""
        results = self.encode([query], return_colbert=False)
        return results[0]

    def encode_documents(self, texts: list[str], batch_size: int = 32) -> list[EmbeddingResult]:
        """批量编码文档 chunks"""
        all_results = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            batch_results = self.encode(batch, return_colbert=False)
            all_results.extend(batch_results)
        return all_results


# 单例
_embedder: BGEM3Embedder | None = None


def get_embedder() -> BGEM3Embedder:
    global _embedder
    if _embedder is None:
        _embedder = BGEM3Embedder()
    return _embedder
