"use client"

import type { Control, FieldValues, Path } from "react-hook-form"
import { useForm } from "react-hook-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { frappe, getErrorMessage } from "@/lib/frappe"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form"

const DOCTYPE = "SMS Semester Setup"

type SemesterSetupDoc = {
  school_year_from?: number
  school_year_to?: number
  basic_ed_start_date?: string
  basic_ed_end_date?: string
  basic_ed_period?: string
  regular_semester_start_date?: string
  regular_semester_end_date?: string
  regular_semester_period?: string
  tri_semester_start_date?: string
  tri_semester_end_date?: string
  tri_semester_period?: string
  last_student_no?: string
  permit_no?: string
}

/**
 * One bordered "term track" box: Start/End date on the header row, and a
 * radio group below picking which period within that track is current —
 * mirrors the legacy School Year Setup screen (Basic Education / Regular
 * Semester / Tri Semester each get their own date range + active period).
 */
function TermTrackSection<T extends FieldValues>({
  title,
  control,
  startName,
  endName,
  periodName,
  periodOptions,
}: {
  title: string
  control: Control<T>
  startName: Path<T>
  endName: Path<T>
  periodName: Path<T>
  periodOptions: string[]
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
        <span className="font-medium">{title}</span>
        <div className="flex flex-wrap items-center gap-4">
          <FormField
            control={control}
            name={startName}
            render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-2 space-y-0">
                <FormLabel className="text-muted-foreground">Start</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    className="w-40"
                    {...field}
                    value={(field.value as string | undefined) ?? ""}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={endName}
            render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-2 space-y-0">
                <FormLabel className="text-muted-foreground">End</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    className="w-40"
                    {...field}
                    value={(field.value as string | undefined) ?? ""}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      </div>
      <FormField
        control={control}
        name={periodName}
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <RadioGroup
                value={(field.value as string | undefined) ?? ""}
                onValueChange={(value) => field.onChange(value)}
                className="gap-2.5"
              >
                {periodOptions.map((option) => (
                  <Label key={option} className="w-fit cursor-pointer font-normal">
                    <RadioGroupItem value={option} />
                    {option}
                  </Label>
                ))}
              </RadioGroup>
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  )
}

/**
 * Administration > System Setup > Semester: the school-year-wide setup that
 * enrollment reads the "current" semester from — one date range + active
 * period per academic track, since Basic Education, Regular Semester, and
 * Tri Semester programs each run their own calendar. This is a Single
 * doctype (one record for the whole school), same shape as Library Settings.
 */
export function SemesterSetup() {
  const queryClient = useQueryClient()

  const { data: doc, isLoading } = useQuery({
    queryKey: [DOCTYPE],
    queryFn: () => frappe.getDoc<SemesterSetupDoc>(DOCTYPE, DOCTYPE),
  })

  const form = useForm<SemesterSetupDoc>({
    defaultValues: doc ?? {},
    values: doc,
  })

  const saveMutation = useMutation({
    mutationFn: (values: SemesterSetupDoc) => frappe.updateDoc(DOCTYPE, DOCTYPE, values),
    onSuccess: () => {
      toast.success("Semester setup saved")
      queryClient.invalidateQueries({ queryKey: [DOCTYPE] })
    },
    onError: (error) => toast.error(`Could not save semester setup: ${getErrorMessage(error)}`),
  })

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
        className="grid gap-4"
      >
        <TermTrackSection
          title="Basic Education"
          control={form.control}
          startName="basic_ed_start_date"
          endName="basic_ed_end_date"
          periodName="basic_ed_period"
          periodOptions={["Regular SchoolYear", "Summer Classes"]}
        />
        <TermTrackSection
          title="Regular Semester"
          control={form.control}
          startName="regular_semester_start_date"
          endName="regular_semester_end_date"
          periodName="regular_semester_period"
          periodOptions={["1st Semester", "2nd Semester", "Summer Class"]}
        />
        <TermTrackSection
          title="Tri Semester"
          control={form.control}
          startName="tri_semester_start_date"
          endName="tri_semester_end_date"
          periodName="tri_semester_period"
          periodOptions={["1st Semester", "2nd Semester", "Summer Class"]}
        />

        <div className="flex flex-wrap items-end justify-between gap-4 rounded-md border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-6">
            <FormField
              control={form.control}
              name="last_student_no"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormLabel className="w-32 shrink-0 text-muted-foreground">
                    Last Student No.
                  </FormLabel>
                  <FormControl>
                    <Input {...field} value={(field.value as string | undefined) ?? ""} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="permit_no"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormLabel className="w-32 shrink-0 text-muted-foreground">
                    Permit No.
                  </FormLabel>
                  <FormControl>
                    <Input {...field} value={(field.value as string | undefined) ?? ""} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-muted-foreground">School Year</Label>
            <FormField
              control={form.control}
              name="school_year_from"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <FormControl>
                    <Input
                      type="number"
                      className="w-24"
                      {...field}
                      value={(field.value as number | undefined) ?? ""}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="school_year_to"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <FormControl>
                    <Input
                      type="number"
                      className="w-24"
                      {...field}
                      value={(field.value as number | undefined) ?? ""}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>

        <Button type="submit" disabled={saveMutation.isPending} className="w-fit">
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
      </form>
    </Form>
  )
}

export default SemesterSetup
