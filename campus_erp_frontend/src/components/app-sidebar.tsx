"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Boxes,
  BookOpen,
  ChevronRight,
  GraduationCap,
  LayoutDashboard,
  Landmark,
  LogOut,
  ShieldCheck,
  Users,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/user-avatar"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

type NavLeaf = { label: string; href: string }

type NavSection = {
  module: string
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  children: NavLeaf[]
}

const MODULE_SECTIONS: NavSection[] = [
  {
    module: "Registrar",
    label: "Registrar",
    href: "/registrar",
    icon: GraduationCap,
    children: [
      { label: "Students", href: "/registrar/students" },
      { label: "Permits", href: "/registrar/permits" },
      { label: "Graduation Batches", href: "/registrar/graduation-batches" },
    ],
  },
  {
    module: "Finance",
    label: "Finance",
    href: "/finance",
    icon: Landmark,
    children: [
      { label: "Assessments", href: "/finance/assessments" },
      { label: "Requisitions", href: "/finance/requisitions" },
      { label: "Purchase Orders", href: "/finance/purchase-orders" },
      { label: "Canteen PCV", href: "/finance/canteen-pcv" },
      { label: "Discounts", href: "/finance/discounts" },
      { label: "Wallets", href: "/finance/wallets" },
    ],
  },
  {
    module: "Personnel",
    label: "Personnel",
    href: "/personnel",
    icon: Users,
    children: [
      { label: "Employees", href: "/personnel/employees" },
      { label: "Benefits", href: "/personnel/benefits" },
      { label: "Overtime", href: "/personnel/overtime" },
      { label: "Loans", href: "/personnel/loans" },
      { label: "Loan Applications", href: "/personnel/loan-applications" },
      { label: "Loan Types", href: "/personnel/loan-types" },
      { label: "Policies", href: "/personnel/policies" },
      { label: "Group Policies", href: "/personnel/group-policies" },
      { label: "Travel Orders", href: "/personnel/travel-orders" },
      { label: "Statutory Reports", href: "/personnel/statutory-reports" },
    ],
  },
  {
    module: "Asset",
    label: "Asset & Property",
    href: "/asset",
    icon: Boxes,
    children: [
      { label: "Register", href: "/asset/register" },
      { label: "Models", href: "/asset/models" },
      { label: "Consumables", href: "/asset/consumables" },
      { label: "Dispatch", href: "/asset/dispatch" },
      { label: "Transfers", href: "/asset/transfers" },
      { label: "Stickers", href: "/asset/stickers" },
    ],
  },
  {
    module: "Library",
    label: "Library",
    href: "/library",
    icon: BookOpen,
    children: [
      { label: "Titles", href: "/library/titles" },
      { label: "Books", href: "/library/books" },
      { label: "Authors", href: "/library/authors" },
      { label: "Publishers", href: "/library/publishers" },
      { label: "Circulation", href: "/library/circulation" },
      { label: "Guests", href: "/library/guests" },
      { label: "Settings", href: "/library/settings" },
    ],
  },
]

const SETTINGS_SECTIONS: NavSection[] = [
  {
    module: "Administration",
    label: "Administration",
    href: "/administration",
    icon: ShieldCheck,
    children: [
      { label: "Approvals", href: "/administration/approvals" },
      { label: "System Setup", href: "/administration/system-setup" },
      { label: "Sessions", href: "/administration/sessions" },
      { label: "Codes", href: "/administration/codes" },
      { label: "Brackets", href: "/administration/brackets" },
      { label: "Event Log", href: "/administration/event-log" },
      { label: "Override Log", href: "/administration/override-log" },
    ],
  },
]

function NavModuleItem({
  section,
  pathname,
  accent = false,
}: {
  section: NavSection
  pathname: string
  accent?: boolean
}) {
  const isActive = pathname.startsWith(section.href)
  const [manualOpen, setManualOpen] = React.useState<boolean | null>(null)
  const open = manualOpen ?? isActive
  const Icon = section.icon

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={section.href} />}
        isActive={pathname === section.href}
        tooltip={section.label}
      >
        <Icon className={cn(accent && "text-primary")} />
        <span>{section.label}</span>
      </SidebarMenuButton>
      <SidebarMenuAction
        onClick={() => setManualOpen(!open)}
        aria-label={open ? `Collapse ${section.label}` : `Expand ${section.label}`}
        aria-expanded={open}
      >
        <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
      </SidebarMenuAction>
      {open && (
        <SidebarMenuSub>
          {section.children.map((child) => (
            <SidebarMenuSubItem key={child.href}>
              <SidebarMenuSubButton
                render={<Link href={child.href} />}
                isActive={pathname === child.href || pathname.startsWith(`${child.href}/`)}
              >
                <span>{child.label}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const { user, hasModule, logout } = useAuth()

  if (!user) return null

  const modules = MODULE_SECTIONS.filter((section) => hasModule(section.module))
  const settings = SETTINGS_SECTIONS.filter((section) => hasModule(section.module))

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center justify-between px-2 py-1.5">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="size-4.5" />
            </div>
            <span className="truncate font-heading text-base font-semibold group-data-[collapsible=icon]:hidden">
              ESTI ERP
            </span>
          </Link>
          <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link href="/dashboard" />}
                  isActive={pathname === "/dashboard"}
                  tooltip="Dashboard"
                >
                  <LayoutDashboard />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Modules</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {modules.map((section) => (
                <NavModuleItem key={section.module} section={section} pathname={pathname} accent />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {settings.length > 0 && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Settings</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {settings.map((section) => (
                    <NavModuleItem key={section.module} section={section} pathname={pathname} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <UserAvatar name={user.full_name} />
              <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-medium">{user.full_name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.roles[0] ?? "Member"}
                </span>
              </div>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
            <Button variant="outline" size="sm" className="w-full" onClick={logout}>
              <LogOut />
              Sign Out
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
