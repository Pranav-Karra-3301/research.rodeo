"use client";

import { useUser } from "@auth0/nextjs-auth0/client";
import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

export function UserMenu() {
  const { user, isLoading } = useUser();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (isLoading) {
    return (
      <div className="w-7 h-7 rounded-full bg-[#e8e7e2] animate-pulse" />
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-1">
        <a href="/auth/login">
          <Button variant="ghost" size="sm" className="text-xs text-[#57534e]">
            Sign in
          </Button>
        </a>
        <a href="/auth/login?screen_hint=signup">
          <Button size="sm" className="text-xs">
            Sign up
          </Button>
        </a>
      </div>
    );
  }

  const initials = (user.name ?? user.email ?? "U")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-semibold transition-colors",
              "bg-[#7c3aed] text-white hover:bg-[#6d28d9]",
              open && "ring-2 ring-[#7c3aed]/30"
            )}
          >
            {user.picture ? (
              <img
                src={user.picture}
                alt=""
                className="w-7 h-7 rounded-full object-cover"
                width={28}
                height={28}
              />
            ) : (
              initials
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>{user.name ?? user.email ?? "Account"}</TooltipContent>
      </Tooltip>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-lg shadow-lg border border-[#e8e7e2] py-1 z-50">
          {/* User info header */}
          <div className="px-3 py-2 border-b border-[#e8e7e2]">
            <div className="text-[12px] font-medium text-[#1c1917] truncate">
              {user.name ?? "User"}
            </div>
            {user.email && (
              <div className="text-[11px] text-[#78716c] truncate">
                {user.email}
              </div>
            )}
          </div>

          {/* Menu items */}
          <div className="py-1">
            <div className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-[#57534e]">
              <User className="w-3.5 h-3.5" />
              <span className="truncate">{user.sub}</span>
            </div>
          </div>

          {/* Sign out */}
          <div className="border-t border-[#e8e7e2] py-1">
            <a
              href="/auth/logout"
              className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
