# 应用镜像：基于 enterprise-kb/python-deps:3.11（须先用 Dockerfile.base 构建）
ARG BASE_IMAGE=enterprise-kb/python-deps:3.11
FROM ${BASE_IMAGE}

WORKDIR /app

COPY . .

# 预下载模型（可选，构建时执行）
# RUN python -c "from FlagEmbedding import BGEM3FlagModel; BGEM3FlagModel('BAAI/bge-m3')"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
