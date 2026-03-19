import { IMPORTANT_DAYS, type ImportantDayRule } from "./important-days"

export type ActiveImportantDay = {
  key: string
  label: string
  type: "single_day" | "date_range" | "season"
  promptContext: string
  note?: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function createDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day)
}

function getSingleDayDate(rule: ImportantDayRule, year: number): Date | null {
  if (rule.month == null || rule.day == null) {
    return null
  }

  return createDate(year, rule.month, rule.day)
}

function getRangeDates(
  rule: ImportantDayRule,
  year: number
): { startDate: Date; endDate: Date } | null {
  if (
    rule.startMonth == null ||
    rule.startDay == null ||
    rule.endMonth == null ||
    rule.endDay == null
  ) {
    return null
  }

  return {
    startDate: createDate(year, rule.startMonth, rule.startDay),
    endDate: createDate(year, rule.endMonth, rule.endDay),
  }
}

function getDayDiff(a: Date, b: Date): number {
  return Math.round(
    (startOfDay(a).getTime() - startOfDay(b).getTime()) / MS_PER_DAY
  )
}

function isSingleDayActive(now: Date, rule: ImportantDayRule): boolean {
  const eventDate = getSingleDayDate(rule, now.getFullYear())
  if (!eventDate) {
    return false
  }

  const windowDaysBefore = rule.windowDaysBefore ?? 0
  const windowDaysAfter = rule.windowDaysAfter ?? 0
  const diffDays = getDayDiff(now, eventDate)

  return diffDays >= -windowDaysBefore && diffDays <= windowDaysAfter
}

function isRangeActive(now: Date, rule: ImportantDayRule): boolean {
  const range = getRangeDates(rule, now.getFullYear())
  if (!range) {
    return false
  }

  const current = startOfDay(now).getTime()
  const start = startOfDay(range.startDate).getTime()
  const end = startOfDay(range.endDate).getTime()

  return current >= start && current <= end
}

function getReferenceDate(now: Date, rule: ImportantDayRule): Date | null {
  if (rule.type === "single_day") {
    return getSingleDayDate(rule, now.getFullYear())
  }

  if (rule.type === "date_range" || rule.type === "season") {
    const range = getRangeDates(rule, now.getFullYear())
    return range?.startDate ?? null
  }

  return null
}

function isRuleActive(now: Date, rule: ImportantDayRule): boolean {
  if (!rule.enabled) {
    return false
  }

  if (rule.type === "single_day") {
    return isSingleDayActive(now, rule)
  }

  if (rule.type === "date_range" || rule.type === "season") {
    return isRangeActive(now, rule)
  }

  return false
}

function toActiveImportantDay(rule: ImportantDayRule): ActiveImportantDay {
  return {
    key: rule.key,
    label: rule.label,
    type: rule.type,
    promptContext: rule.promptContext,
    note: rule.note,
  }
}

export function getActiveImportantDay(
  now: Date = new Date()
): ActiveImportantDay | null {
  const activeRules = IMPORTANT_DAYS.filter((rule) => isRuleActive(now, rule))

  if (activeRules.length === 0) {
    return null
  }

  const sortedRules = [...activeRules].sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority
    }

    const aRef = getReferenceDate(now, a)
    const bRef = getReferenceDate(now, b)

    if (!aRef && !bRef) {
      return 0
    }

    if (!aRef) {
      return 1
    }

    if (!bRef) {
      return -1
    }

    const aDistance = Math.abs(getDayDiff(now, aRef))
    const bDistance = Math.abs(getDayDiff(now, bRef))

    return aDistance - bDistance
  })

  return toActiveImportantDay(sortedRules[0])
}
