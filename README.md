# StudyMate AI — Pure Cute Halloween AI Education Platform

**Design and Build by Team Tricksters**

StudyMate AI is a full-stack AI-powered study sanctuary built with **Next.js 15 App Router**, **TypeScript (strict mode)**, **Tailwind CSS**, **Google Gemini AI (`@google/genai`)**, **Zod**, and **Supabase PostgreSQL / Hybrid Persistent Vault**.

---

## Quick Start (Local Development)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open in browser:**
   - Main App & Google Sign-In: [http://localhost:3000/auth](http://localhost:3000/auth)
   - Student Dashboard: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
   - Admin Dashboard: [http://localhost:3000/admin/dashboard](http://localhost:3000/admin/dashboard)
   - SuperAdmin Console: [http://localhost:3000/superadmin/dashboard](http://localhost:3000/superadmin/dashboard)

---

## Pre-Configured Roles & Access

- **Supreme SuperAdmin (`superadmin`)**: `amrendrayadav03321@gmail.com`
  - Exclusive access to `/superadmin/dashboard` (invisible to regular Admins and Students), `/admin/dashboard`, and all student study tools.
  - Can grant/revoke Admin role for any user and block/unblock accounts with automated email notifications.
- **Authorized Admin (`admin`)**: `ratawajahnvi@gmail.com`
  - Access to `/admin/dashboard` and all student study tools.
- **Students (`student`)**: Any Google Account (`@gmail.com` or Google Workspace email)
  - Automatic unique `SM-XXXX-XXXX` Student ID generation, 1-year persistent auto-login, and full access to all study features.

---

## Core Modules & Features

1. **Google Account & Student ID Authentication** (with 1-year persistent session & auto-login)
2. **Student Dashboard**
3. **Study Materials & Multi-Format Extraction Pipeline** (PDF, DOCX, PPTX, XLSX, CSV, TXT, MD, Images, Audio, Video)
4. **Independent AI Services** (strictly isolated schemas & storage):
   - **AI Detailed Notes** (`/dashboard/ai-notes`)
   - **Rapid Short Notes** (`/dashboard/short-notes`)
   - **Source-Grounded AI Chatbot** (`/dashboard/chat`)
   - **Interactive Flip Flashcards** (`/dashboard/flashcards`)
   - **Practice Questions & Answer Keys** (`/dashboard/questions`)
5. **Three Extra Deterministic Features**:
   - **AI Study Planner** (`/dashboard/planner`)
   - **Focus Mode + Pomodoro Timer** (`/dashboard/focus`)
   - **Smart SM-2 Spaced Repetition Revision System** (`/dashboard/revision`)
6. **Admin Dashboard (`/admin/dashboard`) & Supreme SuperAdmin Command Center (`/superadmin/dashboard`)**
