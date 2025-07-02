"use client";

import React from "react"; // Removed useState as it's now controlled
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";

import { cn } from "../../lib/utils";

export type TabItem = {
  id: string;
  icon: LucideIcon;
  label: string;
  color: string; // Tailwind background color class
};

export type ExpandableTabsProps = {
  tabs: TabItem[];
  activeTabIdFromParent: string; // Controlled active tab ID
  onTabClick?: (tabId: string) => void; // Callback for tab clicks
  className?: string;
};

export const ExpandableTabs = ({
  tabs,
  activeTabIdFromParent,
  onTabClick,
  className,
}: ExpandableTabsProps) => {
  return (
    <div
      className={cn(
        "flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-2xl bg-card text-secondary-foreground shadow-fluid-sm border border-border",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeTabIdFromParent === tab.id;
        const Icon = tab.icon;

        return (
          <motion.div
            key={tab.id}
            layout
            className={cn(
              "flex items-center justify-center rounded-xl cursor-pointer overflow-hidden h-[46px] sm:h-[50px]",
              tab.color, // This applies the background color
              isActive ? "flex-1 shadow-md" : "flex-none opacity-80 hover:opacity-100",
            )}
            onClick={() => onTabClick?.(tab.id)}
            initial={false}
            animate={{
              width: isActive ? 220 : 50, // Increased active width, removed conditional logic
            }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30,
            }}
          >
            <motion.div
              className="flex items-center justify-center h-full aspect-square" // Ensure full height for icon container
              initial={{ filter: "blur(10px)" }}
              animate={{ filter: "blur(0px)" }}
              exit={{ filter: "blur(10px)" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <Icon className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 text-white" /> {/* Changed to text-white for explicit contrast */}
              <AnimatePresence initial={false}>
                {isActive && (
                  <motion.span
                    className="ml-2 sm:ml-3 text-white font-medium text-xs sm:text-sm max-sm:hidden whitespace-nowrap overflow-hidden text-ellipsis" // Added text flow classes and changed to text-white
                    initial={{ opacity: 0, scaleX: 0.8 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    exit={{ opacity: 0, scaleX: 0.8 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    style={{ originX: 0 }}
                  >
                    {tab.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
};
