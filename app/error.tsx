'use client';

import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md w-full bg-white rounded-lg border border-red-200 p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold text-[#151c27]">Algo deu errado</h2>
          <p className="text-sm text-[#727780] mt-1">{error.message || 'Erro inesperado na aplicação.'}</p>
          {error.digest && (
            <p className="text-xs font-mono text-[#c2c7d1] mt-2">ID: {error.digest}</p>
          )}
        </div>
        <button
          onClick={reset}
          className="bg-[#0f4c81] hover:bg-[#00355f] text-white text-sm font-semibold px-5 py-2 rounded transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
