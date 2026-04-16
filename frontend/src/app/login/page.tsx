"use client";

import React, { useState } from 'react';
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Lock, ShieldCheck, Sparkles } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading } = useAuth();
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('请输入邮箱和密码');
      return;
    }
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError('登录失败，请重试');
    }
  };

  return (
    <div className="h-screen w-screen bg-[#F9F7F2] flex items-center justify-center font-sans relative overflow-hidden">
      {/* 装饰性背景 */}
      <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] bg-accent/10 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="max-w-[420px] w-full p-4 relative z-10">
        <div className="text-center mb-10 space-y-3">
          <div className="w-16 h-16 rounded-sm bg-primary flex items-center justify-center mx-auto shadow-sm mb-6 rotate-3 transform transition-transform hover:rotate-0">
             <span className="text-3xl font-serif italic font-bold text-primary-foreground">K</span>
          </div>
          <h1 className="text-3xl font-serif italic font-bold tracking-tight">Enterprise Knowledge Base</h1>
          <p className="text-muted-foreground text-sm font-sans italic">企业级 RAG 与图谱增强知识库系统</p>
        </div>

        <Card className="paper-border shadow-xl bg-white/80 backdrop-blur-md relative">
          <div className="absolute -top-4 -right-4 w-12 h-12 flex items-center justify-center bg-accent border border-border rounded-sm shadow-sm font-serif italic font-bold text-primary -rotate-6">
            Log
          </div>
          
          <CardHeader className="pt-10 pb-6">
            <CardTitle className="text-xl font-serif italic">用户身份验证</CardTitle>
            <CardDescription className="font-sans text-xs uppercase tracking-widest font-bold opacity-60">请使用企业邮箱登录</CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    type="email" 
                    placeholder="name@company.com" 
                    className="pl-10 h-11 bg-white border-border focus-visible:ring-primary shadow-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    type="password" 
                    placeholder="••••••••" 
                    className="pl-10 h-11 bg-white border-border focus-visible:ring-primary shadow-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
              
              {error && (
                <p className="text-xs text-destructive font-bold text-center italic">{error}</p>
              )}

              <Button 
                type="submit" 
                className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 transition-all font-bold tracking-widest uppercase text-xs"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ShieldCheck className="h-4 w-4 mr-2" />
                )}
                {isLoading ? '验证中...' : '进入系统'}
              </Button>
            </form>
          </CardContent>
          
          <CardFooter className="flex flex-col gap-4 border-t border-border pt-6 bg-muted/20">
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
              <span className="flex items-center gap-1"><Sparkles size={10} className="text-primary" /> RAGAS 评估启用</span>
              <span>•</span>
              <span className="flex items-center gap-1"><ShieldCheck size={10} className="text-primary" /> MD5 签名校验</span>
            </div>
          </CardFooter>
        </Card>
        
        <div className="mt-10 text-center space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold opacity-40">
            © 2026 Enterprise KB AI · Secure Connection
          </p>
          <div className="flex justify-center gap-4 text-[10px] text-muted-foreground uppercase tracking-widest font-bold underline decoration-dotted underline-offset-4 cursor-pointer">
            <span>隐私政策</span>
            <span>审计条例</span>
            <span>帮助中心</span>
          </div>
        </div>
      </div>
    </div>
  );
}
