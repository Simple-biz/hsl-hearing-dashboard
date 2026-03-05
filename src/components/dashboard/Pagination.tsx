"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const PAGE_SIZES = [50, 100, 250, 500];

export default function Pagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border border-navy-200 rounded-xl">
      {/* Left: page size */}
      <div className="flex items-center gap-2 text-sm text-navy-600">
        <span>Show</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="px-2 py-1 rounded border border-navy-200 bg-navy-50 text-sm
                     focus:border-accent outline-none"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span>per page</span>
      </div>

      {/* Center: showing X-Y of Z */}
      <span className="text-sm text-navy-500 tabular-nums">
        {from}–{to} of {totalCount.toLocaleString()}
      </span>

      {/* Right: page controls */}
      <div className="flex items-center gap-1">
        <PageBtn onClick={() => onPageChange(1)} disabled={page === 1}>
          <ChevronsLeft size={16} />
        </PageBtn>
        <PageBtn onClick={() => onPageChange(page - 1)} disabled={page === 1}>
          <ChevronLeft size={16} />
        </PageBtn>

        <span className="px-3 py-1 text-sm tabular-nums text-navy-700 font-medium">
          {page} / {totalPages}
        </span>

        <PageBtn
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
        >
          <ChevronRight size={16} />
        </PageBtn>
        <PageBtn
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
        >
          <ChevronsRight size={16} />
        </PageBtn>
      </div>
    </div>
  );
}

function PageBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "p-1.5 rounded-lg transition-colors",
        disabled
          ? "text-navy-300 cursor-not-allowed"
          : "text-navy-600 hover:bg-navy-100 hover:text-navy-800",
      )}
    >
      {children}
    </button>
  );
}
