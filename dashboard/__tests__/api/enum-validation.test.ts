import {
  AlertLevelSchema,
  AlertStatusSchema,
  MeetingStatusSchema,
  HealthStatusSchema,
  ComponentStatusSchema,
  HealthStatusResponseSchema,
  AlertCreateSchema,
  AlertUpdateSchema,
  TaskCreateSchema,
  TaskUpdateSchema,
} from "@/lib/validation"
import { z } from "zod"

describe("Alert Enum Validation", () => {
  describe("AlertLevelSchema", () => {
    const validLevels = ["info", "warning", "critical"]
    const invalidLevels = ["debug", "error", "fatal", "trace", "INFO", "", null, undefined, 123, {}]

    test("accepts valid alert levels", () => {
      validLevels.forEach(level => {
        const result = AlertLevelSchema.safeParse(level)
        expect(result.success).toBe(true)
      })
    })

    test("rejects invalid alert levels", () => {
      invalidLevels.forEach(level => {
        const result = AlertLevelSchema.safeParse(level)
        expect(result.success).toBe(false)
      })
    })
  })

  describe("AlertStatusSchema", () => {
    const validStatuses = ["active", "resolved"]
    const invalidStatuses = ["pending", "archived", "deleted", "in_review"]

    test("accepts valid alert statuses", () => {
      validStatuses.forEach(status => {
        const result = AlertStatusSchema.safeParse(status)
        expect(result.success).toBe(true)
      })
    })

    test("rejects invalid alert statuses", () => {
      invalidStatuses.forEach(status => {
        const result = AlertStatusSchema.safeParse(status)
        expect(result.success).toBe(false)
      })
    })
  })
})

describe("Health Status Enum Validation", () => {
  describe("HealthStatusSchema", () => {
    const validStatuses = ["healthy", "degraded", "unhealthy"]
    const invalidStatuses = ["warning", "error", "critical"]

    test("accepts valid health statuses", () => {
      validStatuses.forEach(status => {
        const result = HealthStatusSchema.safeParse(status)
        expect(result.success).toBe(true)
      })
    })

    test("rejects invalid health statuses", () => {
      invalidStatuses.forEach(status => {
        const result = HealthStatusSchema.safeParse(status)
        expect(result.success).toBe(false)
      })
    })
  })
})
