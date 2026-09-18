import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface ReportCardProps {
  title: string
  description: string
  available?: boolean
  onClick?: () => void
}

/** Fixed-height report tile used across the Reports tabs — keeps title/badge
 * layout stable regardless of how many words the title wraps to, so cards in
 * the same row line up. */
export function ReportCard({ title, description, available = false, onClick }: ReportCardProps) {
  return (
    <Card
      className={cn(
        "h-full transition-colors",
        available ? "cursor-pointer hover:bg-muted/50" : "opacity-70"
      )}
      onClick={available ? onClick : undefined}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="min-h-11 text-base font-semibold leading-snug line-clamp-2">
            {title}
          </CardTitle>
          <Badge variant={available ? "default" : "outline"} className="mt-0.5 shrink-0">
            {available ? "Open" : "Coming soon"}
          </Badge>
        </div>
        <CardDescription className="line-clamp-2">{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}
