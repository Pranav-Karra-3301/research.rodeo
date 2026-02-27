"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-lg border border-[#dddcd7] bg-[#f8f7f4] px-3 py-1 text-sm text-[#1c1917] shadow-sm transition-colors placeholder:text-[#a8a29e] focus-visible:outline-none focus-visible:border-[#c8c7c2] focus-visible:bg-[#f3f2ee] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
