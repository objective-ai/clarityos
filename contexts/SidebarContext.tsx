"use client";

import { createContext, useContext } from "react";

const SidebarContext = createContext(false);

export const SidebarProvider = SidebarContext.Provider;
export const useSidebarCollapsed = () => useContext(SidebarContext);
