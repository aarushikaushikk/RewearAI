import React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F7F3] px-4 py-12">
      {children}
    </div>
  );
}
