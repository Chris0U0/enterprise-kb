"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface User {
  email: string;
  role: 'Admin' | 'Editor' | 'Viewer';
  name: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // 模拟从 localStorage 恢复会话
    const savedUser = localStorage.getItem('kb-user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoading && !user && pathname !== '/login') {
      router.push('/login');
    }
  }, [user, isLoading, pathname, router]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    // 模拟登录逻辑
    await new Promise(resolve => setTimeout(resolve, 1000));
    const mockUser: User = {
      email,
      name: email.split('@')[0],
      role: email.includes('admin') ? 'Admin' : 'Editor'
    };
    setUser(mockUser);
    localStorage.setItem('kb-user', JSON.stringify(mockUser));
    setIsLoading(false);
    router.push('/');
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('kb-user');
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
