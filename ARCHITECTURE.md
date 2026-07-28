# Coldingrod Architecture & Engineering Guide

This document serves as the project's engineering guide. All development must adhere to these standards.

## 1. Folder Structure
- **`src/app/`**: Next.js App Router pages, layouts, loading, error, and routing logic.
- **`src/components/`**: Reusable UI components.
  - `components/ui/`: shadcn/ui generic components (buttons, inputs, etc.).
  - `components/layout/`: App shell components (Sidebar, Topbar).
  - `components/shared/`: Cross-feature shared components.
- **`src/features/`**: Feature-specific logic and components (e.g., `features/auth`, `features/workspaces`).
- **`src/lib/`**: Core utilities, configuration, and setup (e.g., Supabase client, utils).
- **`src/hooks/`**: Reusable React hooks.
- **`src/types/`**: Global TypeScript types and interfaces.
- **`src/services/`**: Data fetching and business logic abstraction (e.g., `services/workspaceService.ts`).
- **`src/actions/`**: Next.js Server Actions (e.g., `actions/auth.ts`).

## 2. Naming Conventions
- **Components**: PascalCase (e.g., `WorkspaceSwitcher.tsx`).
- **Files/Folders**: camelCase or kebab-case (e.g., `workspace-switcher`, `auth.ts`), except for Next.js routing files (`page.tsx`, `layout.tsx`).
- **Hooks**: camelCase starting with `use` (e.g., `useWorkspace.ts`).
- **Types**: PascalCase.
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRY_COUNT`).

## 3. Component Conventions
- Use **Tailwind CSS** utilities strictly. **No CSS modules**.
- Prefer **Lucide Icons**.
- Do not put business logic inside UI components. Keep UI components dumb and pure where possible.
- Reusable components should go to `src/components/`, while one-off feature components go to `src/features/[featureName]/components/`.

## 4. Server vs Client Component Rules
- **Default to Server Components**.
- Use `"use client"` only when required (e.g., for interactivity, hooks like `useState`/`useEffect`, or browser APIs).
- Keep Client Components as leaf nodes in the component tree as much as possible.
- Pass data from Server Components down to Client Components via props.

## 5. Data Fetching Rules
- Perform data fetching in **Server Components** or **Server Actions**.
- Use Supabase Server Client (`@supabase/ssr`) for data fetching.
- Authentication, workspace lookup, and permission lookup must happen on the server.

## 6. State Management Rules
- Rely on **URL and Server State** as the primary source of truth (e.g., `[workspaceSlug]` in the URL).
- Use **React Context** only for simple, localized state if passing props is too deep (prop drilling).
- **Zustand** is intentionally avoided until strictly necessary.
- Do not store the active workspace only in client state.

## 7. Authentication Flow
- Handled by **Supabase Auth** (Email/Password, Google OAuth, Forgot Password).
- Logic resides in **Server Actions** (`src/actions/auth.ts`).
- Middleware protects routes. Unauthenticated users on private routes are redirected to `/login`.

## 8. Workspace Flow
- URLs must be scoped to the workspace: `/dashboard/[workspaceSlug]`.
- **After login**, load the user's workspaces. Redirect to `/dashboard/{lastActiveWorkspace}` if it exists (e.g. from a cookie or DB preference). Otherwise, redirect to the user's **Personal Workspace**.
- **Workspace Switcher**: Lists all workspaces, highlights the current one, supports Personal + Company, and navigates using `router.push()` (no full page reload).

## 9. Permission Flow
- Every dashboard request must validate:
  1. The user is authenticated.
  2. The user is a member of the workspace in the URL.
- Validation happens on the server (Middleware or Layout/Page Server Components).
- Never trust client-side checks for authorization.

## 10. Coding Standards
- **TypeScript strict mode**: Enabled. No `any` types allowed. Use strong typing for all function arguments and returns.
- **No duplicated logic**: Extract reusable hooks or utility functions.
- **Error Handling**: Use `loading.tsx`, `error.tsx`, and `not-found.tsx` for granular loading states and error boundaries.

---
*End of Guide*
