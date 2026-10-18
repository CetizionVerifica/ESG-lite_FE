import { describe, expect, it } from "vitest";
import {
  AUTO_SOURCE_KEYS,
  ESRS_TOPICS,
  FRAMEWORK_CODES,
  KPI_AGGREGATIONS,
  KPI_CHECK_IDS,
  KPI_ERROR_CODES,
  KPI_ERROR_STATUS,
  KPI_FREQUENCIES,
  KPI_LEVELS,
  KPI_LOCK_LEFT_REASONS,
  KPI_PATHS,
  KPI_ROUTE_IDS,
  KPI_SOURCES,
  KPI_TOPICS,
  KPI_VALUE_STATUSES,
  KPI_VALUE_TYPES,
  MAPPING_FITS,
  MY_KPI_GROUPS,
  REQUIREMENT_LEVELS,
  TARGET_DIRECTIONS,
  UNIT_DIMENSIONS,
  YEAR_TYPES,
  isKpiErrorCode,
} from "./contracts";
import {
  AGGREGATION_LABEL,
  AUTO_SOURCE_LABEL,
  CHECK_LABEL,
  ERROR_MESSAGE,
  ESRS_TOPIC_LABEL,
  FIT_DESCRIPTION,
  FIT_LABEL,
  FRAMEWORK_DESCRIPTION,
  FRAMEWORK_LABEL,
  FRAMEWORK_SETUP_LABEL,
  FREQUENCY_LABEL,
  LEVEL_LABEL,
  LOCK_LEFT_REASON_LABEL,
  MY_KPI_GROUP_LABEL,
  REQUIREMENT_LABEL,
  SOURCE_DESCRIPTION,
  SOURCE_LABEL,
  TARGET_DIRECTION_LABEL,
  TOPIC_LABEL,
  UNIT_DIMENSION_LABEL,
  VALUE_STATUS_LABEL,
  VALUE_TYPE_LABEL,
  YEAR_TYPE_LABEL,
  disclosureBadge,
  esrsTopicLabel,
} from "./labels";

const CASES: [string, readonly string[], Record<string, string>][] = [
  ["FrameworkCode", FRAMEWORK_CODES, FRAMEWORK_LABEL],
  ["FrameworkCode (setup)", FRAMEWORK_CODES, FRAMEWORK_SETUP_LABEL],
  ["FrameworkCode (description)", FRAMEWORK_CODES, FRAMEWORK_DESCRIPTION],
  ["RequirementLevel", REQUIREMENT_LEVELS, REQUIREMENT_LABEL],
  ["KpiTopic", KPI_TOPICS, TOPIC_LABEL],
  ["KpiValueType", KPI_VALUE_TYPES, VALUE_TYPE_LABEL],
  ["KpiSource", KPI_SOURCES, SOURCE_LABEL],
  ["KpiSource (description)", KPI_SOURCES, SOURCE_DESCRIPTION],
  ["KpiAggregation", KPI_AGGREGATIONS, AGGREGATION_LABEL],
  ["KpiLevel", KPI_LEVELS, LEVEL_LABEL],
  ["KpiFrequency", KPI_FREQUENCIES, FREQUENCY_LABEL],
  ["KpiValueStatus", KPI_VALUE_STATUSES, VALUE_STATUS_LABEL],
  ["MappingFit", MAPPING_FITS, FIT_LABEL],
  ["MappingFit (description)", MAPPING_FITS, FIT_DESCRIPTION],
  ["AutoSourceKey", AUTO_SOURCE_KEYS, AUTO_SOURCE_LABEL],
  ["UnitDimension", UNIT_DIMENSIONS, UNIT_DIMENSION_LABEL],
  ["EsrsTopic", ESRS_TOPICS, ESRS_TOPIC_LABEL],
  ["YearType", YEAR_TYPES, YEAR_TYPE_LABEL],
  ["TargetDirection", TARGET_DIRECTIONS, TARGET_DIRECTION_LABEL],
  ["MyKpiGroup", MY_KPI_GROUPS, MY_KPI_GROUP_LABEL],
  ["KpiLockLeftReason", KPI_LOCK_LEFT_REASONS, LOCK_LEFT_REASON_LABEL],
  ["KpiCheckId", KPI_CHECK_IDS, CHECK_LABEL],
  ["KpiErrorCode", KPI_ERROR_CODES, ERROR_MESSAGE],
];

describe("KPI labels", () => {
  it.each(CASES)("%s: every value has a plain, non-empty label and nothing extra", (_name, values, labels) => {
    expect(Object.keys(labels).sort()).toEqual([...values].sort());
    for (const v of values) {
      const label = labels[v];
      expect(label.trim().length, v).toBeGreaterThan(0);
      // Sentence case: no label is a raw code (snake case or a KPI_ code).
      expect(label, v).not.toMatch(/_/);
    }
  });

  it("never shows an error code to the user", () => {
    for (const code of KPI_ERROR_CODES) expect(ERROR_MESSAGE[code]).not.toContain(code);
  });

  it("names frameworks the way 05-ux says: ESRS in badges, CSRD (ESRS) in setup", () => {
    expect(FRAMEWORK_LABEL.ESRS).toBe("ESRS");
    expect(FRAMEWORK_SETUP_LABEL.ESRS).toBe("CSRD (ESRS)");
    expect(disclosureBadge("GRI", "303-3")).toBe("GRI 303-3");
    expect(esrsTopicLabel("E1")).toBe("E1 Climate change");
  });

  it("uses the emission status words", () => {
    expect(Object.values(VALUE_STATUS_LABEL)).toEqual(["Draft", "Pending", "Approved", "Rejected"]);
  });
});

describe("KPI contracts (mirror of 01-contracts)", () => {
  it("has the §1 enum values in order", () => {
    expect(FRAMEWORK_CODES).toEqual(["GRI", "BRSR", "ESRS"]);
    expect(KPI_TOPICS).toHaveLength(16);
    expect(AUTO_SOURCE_KEYS).toHaveLength(10);
    expect(KPI_VALUE_STATUSES).toEqual(["draft", "pending", "approved", "rejected"]);
  });

  it("gives each §4 error code its HTTP status", () => {
    expect(KPI_ERROR_CODES).toHaveLength(22);
    expect(KPI_ERROR_STATUS.KPI_NOT_YOUR_REVIEW).toBe(403);
    expect(KPI_ERROR_STATUS.KPI_TRACKING_OFF).toBe(403);
    expect(KPI_ERROR_STATUS.KPI_REASON_REQUIRED).toBe(400);
    expect(isKpiErrorCode("KPI_PERIOD_LOCKED")).toBe(true);
    expect(isKpiErrorCode("NOT_A_CODE")).toBe(false);
  });

  it("has a path for every §6 route id", () => {
    expect(Object.keys(KPI_PATHS).sort()).toEqual([...KPI_ROUTE_IDS].sort());
    expect(KPI_PATHS["kpi-library"]).toBe("/setup/kpi-library");
  });
});
