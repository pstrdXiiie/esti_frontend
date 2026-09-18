"use client"

import { type ChangeEvent, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { frappe, getErrorMessage } from "@/lib/frappe"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form"

const DOCTYPE = "SMS Print Header"

type PrintHeaderDoc = {
  school_name?: string
  address?: string
  phone?: string
  logo?: string
}

/**
 * Administration > System Setup > Print Header: the letterhead every
 * printed report (Enrollment Listing, transcripts, etc.) pulls its
 * school name/address/phone/logo from, instead of each report hardcoding
 * or guessing at that info. Single doctype, same shape as Semester Setup.
 */
export function PrintHeaderSetup() {
  const queryClient = useQueryClient()
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string>("")

  const { data: doc, isLoading } = useQuery({
    queryKey: [DOCTYPE],
    queryFn: () => frappe.getDoc<PrintHeaderDoc>(DOCTYPE, DOCTYPE),
  })

  const form = useForm<PrintHeaderDoc>({
    defaultValues: doc ?? {},
    values: doc,
  })

  // Revokes the previous blob: URL whenever it's replaced by a newly-picked
  // file, and the final one on unmount (e.g. switching away from this tab —
  // base-ui's TabsPanel unmounts inactive panels by default) — a plain
  // revoke-on-pick inside handleLogoChange only covers the former.
  useEffect(() => {
    return () => {
      if (logoPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(logoPreviewUrl)
    }
  }, [logoPreviewUrl])

  function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreviewUrl(URL.createObjectURL(file))
  }

  const saveMutation = useMutation({
    mutationFn: async (values: PrintHeaderDoc) => {
      const payload: PrintHeaderDoc = { ...values }
      if (logoFile) {
        const uploaded = await frappe.uploadFile(logoFile)
        payload.logo = uploaded.file_url
      }
      return frappe.updateDoc(DOCTYPE, DOCTYPE, payload)
    },
    onSuccess: () => {
      toast.success("Print header saved")
      setLogoFile(null)
      queryClient.invalidateQueries({ queryKey: [DOCTYPE] })
    },
    onError: (error) => toast.error(`Could not save print header: ${getErrorMessage(error)}`),
  })

  if (isLoading) {
    return <Skeleton className="h-72 w-full" />
  }

  const logoSrc = logoPreviewUrl || doc?.logo || ""

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
        className="grid gap-5"
      >
        <div className="flex flex-wrap items-start gap-6">
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">Logo</p>
            <label
              htmlFor="print-header-logo"
              className="flex h-24 w-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border bg-muted text-[10px] text-muted-foreground"
            >
              {logoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoSrc} alt="School logo preview" className="h-full w-full object-contain" />
              ) : (
                "No Logo"
              )}
              <input
                id="print-header-logo"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
            </label>
          </div>

          <div className="grid flex-1 gap-4 min-w-64">
            <FormField
              control={form.control}
              name="school_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>School Name</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ""} rows={2} />
              </FormControl>
            </FormItem>
          )}
        />

        <Button type="submit" disabled={saveMutation.isPending} className="w-fit">
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
      </form>
    </Form>
  )
}

export default PrintHeaderSetup
