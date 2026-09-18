"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SemesterSetup } from "@/components/ui/administration/system-setup/semester-setup"
import { PrintHeaderSetup } from "@/components/ui/administration/system-setup/print-header-setup"

/**
 * Administration > System Setup: master data that other modules reference,
 * one tab per setup entity. Semester (SMS Semester Setup) is the first
 * entity — a school-wide singleton with a date range and "current period"
 * per academic track (Basic Education / Regular Semester / Tri Semester),
 * since enrollment screens (e.g. Pre-Enrollment) currently only default
 * academic year/semester from the student's own latest record, with no
 * shared "current semester" to pull from.
 *
 * The tab list's height isn't fixed to the viewport: with few entities it
 * should hug its content rather than leave a tall empty box below the last
 * tab (as a Maintenance-style `h-[50vh]` would with only one or two tabs).
 */
export function SystemSetup() {
    return (
        <Tabs
            defaultValue="semester"
            orientation="vertical"
            className="flex-row items-stretch bg-card p-4 rounded-lg shadow-md w-full h-[78vh] border border-border"
        >
            <TabsList className="grid w-70 grid-cols-1 gap-2 border-0 bg-card mr-7 h-fit shrink-0">
                <TabsTrigger value="semester" className="w-full justify-start gap-2 p-3 border-border data-active:bg-primary data-active:text-primary-foreground">
                    Semester
                </TabsTrigger>
                <TabsTrigger value="print-header" className="w-full justify-start gap-2 p-3 border-border data-active:bg-primary data-active:text-primary-foreground">
                    Print Header
                </TabsTrigger>
            </TabsList>
            <TabsContent value="semester" className="mt-0 min-w-0 flex-1 overflow-y-auto">
                <div className="tabContent min-w-0 max-w-full rounded-md border-border">
                    <SemesterSetup />
                </div>
            </TabsContent>
            <TabsContent value="print-header" className="mt-0 min-w-0 flex-1 overflow-y-auto">
                <div className="tabContent min-w-0 max-w-full rounded-md border-border">
                    <PrintHeaderSetup />
                </div>
            </TabsContent>
        </Tabs>
    )
}

export default SystemSetup
