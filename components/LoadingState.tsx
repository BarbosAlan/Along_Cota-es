'use client';

export function LoadingState({ message = 'Buscando dados…' }: { message?: string }) {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Stats band skeleton */}
      <div className="bg-white rounded-lg border border-[#c2c7d1] grid grid-cols-2 md:grid-cols-5 divide-x divide-[#c2c7d1]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-5 py-4">
            <div className="h-2 w-14 bg-[#e2e8f8] rounded mb-2.5" />
            <div className="h-5 w-20 bg-[#e2e8f8] rounded" />
          </div>
        ))}
      </div>

      {/* Filter + count skeleton */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-48 bg-white border border-[#c2c7d1] rounded" />
        <div className="h-6 w-16 bg-[#e2e8f8] rounded ml-auto" />
      </div>

      {/* Table skeleton */}
      <div className="bg-white rounded-lg border border-[#c2c7d1] overflow-hidden">
        <div className="h-10 bg-[#f0f3ff] border-b border-[#c2c7d1]" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`flex items-center px-4 py-3 gap-4 border-b border-[#e7eefe] ${i % 2 === 0 ? 'bg-white' : 'bg-[#f9f9ff]'}`}
          >
            <div className="h-2.5 w-16 bg-[#e2e8f8] rounded flex-shrink-0" />
            <div className="h-5 w-16 bg-[#e2e8f8] rounded-full flex-shrink-0" />
            <div className="h-2.5 w-10 bg-[#e2e8f8] rounded flex-shrink-0" />
            <div className="flex-1" />
            <div className="h-2.5 w-20 bg-[#e2e8f8] rounded" />
            <div className="h-2.5 w-20 bg-[#e2e8f8] rounded" />
          </div>
        ))}
      </div>

      <p className="text-xs text-center text-[#727780]">{message}</p>
    </div>
  );
}
