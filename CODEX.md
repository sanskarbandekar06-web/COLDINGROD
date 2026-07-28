# Coldingrod Project Codex

Welcome to the Coldingrod Codex. This document provides a comprehensive overview of the project's architecture, rules, and tech stack to help AI assistants and developers onboard instantly.

## 1. Core Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript (Strict Mode)
- **Styling**: Tailwind CSS v4, `tailwind-merge`, `clsx`
- **UI Components**: shadcn/ui, Radix UI (`@base-ui/react`), Lucide React
- **Database & Auth**: Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- **State Management**: React Context, Server State (Zustand only when absolutely necessary)
- **Validation/Schema**: Zod (implied for typical next.js setups)

## 2. Directory Structure
- `src/app/`: Next.js App Router layout, pages, and routing logic.
- `src/components/`: Reusable UI components.
  - `components/ui/`: Generic shadcn/ui components.
  - `components/layout/`: App shell, sidebars, navigation.
  - `components/shared/`: Cross-feature shared components.
- `src/features/`: Feature-specific logic (e.g., `features/auth`, `features/workspaces`).
- `src/lib/`: Core utilities and configuration.
- `src/hooks/`: Reusable React hooks.
- `src/types/`: Global TypeScript interfaces.
- `src/services/`: Data fetching and business logic abstraction.
- `src/actions/`: Next.js Server Actions.
- `supabase/migrations/`: Database schema and migrations.

## 3. Architecture & Development Guidelines
- **Server Components by Default**: Always use React Server Components unless client-side interactivity is required (`"use client"`). Keep client components as leaf nodes.
- **Data Fetching**: Must be done in Server Components or Server Actions using Supabase SSR.
- **State Source of Truth**: The URL should dictate the state (e.g., `/[workspaceSlug]`).
- **Styling**: Use strictly Tailwind CSS. No CSS modules.
- **Naming Conventions**:
  - Components/Types: `PascalCase`
  - Files/Folders: `camelCase` or `kebab-case` (except routing files like `page.tsx`).
  - Hooks: `camelCase` starting with `use`.
  - Constants: `UPPER_SNAKE_CASE`.

## 4. Auth & Workspaces Flow
- **Authentication**: Managed via Supabase Auth (Email/Password, OAuth). Protected routes use Middleware.
- **Workspaces**: URLs are scoped to the workspace slug. Server-side validation must check user authentication and workspace membership before granting access.

## 5. Coding Standards
- No `any` types. Strict typing everywhere.
- Do not duplicate logic; extract into hooks or utilities.
- Do not place heavy business logic in UI components.
- Leverage Next.js error boundaries (`error.tsx`) and loading states (`loading.tsx`).
