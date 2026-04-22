import asyncio
import httpx
from openai import AsyncOpenAI
import sys

async def diagnostic():
    api_key = "sk-dcdf2acccf0c4e5da0adc0eb71cdec0b"
    base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    
    print(f"--- LLM 连接诊断开始 ---")
    print(f"目标地址: {base_url}")
    
    # 1. 基础网络检查
    try:
        async with httpx.AsyncClient(trust_env=False) as client:
            resp = await client.get("https://www.baidu.com", timeout=5.0)
            print(f"✅ 基础互联网访问: 正常 (HTTP {resp.status_code})")
    except Exception as e:
        print(f"❌ 基础互联网访问失败: {e}")

    # 2. 阿里云地址解析检查
    try:
        import socket
        ip = socket.gethostbyname("dashscope.aliyuncs.com")
        print(f"✅ DNS 解析成功: dashscope.aliyuncs.com -> {ip}")
    except Exception as e:
        print(f"❌ DNS 解析失败: {e}")

    # 3. 模拟 SDK 调用
    print(f"尝试调用模型 qwen-turbo...")
    try:
        # 使用刚才我们在代码里配置的 transport
        transport = httpx.AsyncHTTPTransport(trust_env=False, local_address="0.0.0.0")
        http_client = httpx.AsyncClient(timeout=10.0, transport=transport, trust_env=False)
        
        client = AsyncOpenAI(api_key=api_key, base_url=base_url, http_client=http_client)
        
        resp = await client.chat.completions.create(
            model="qwen-turbo",
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=10
        )
        print(f"✅ LLM 调用成功: {resp.choices[0].message.content}")
    except Exception as e:
        print(f"❌ LLM 调用最终失败: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(diagnostic())
