export interface NumberLayout {
  parts: Intl.NumberFormatPart[];
  groupSeparator: string;
  primaryGroupSize: number;
  secondaryGroupSize: number;
  minimumGroupingDigits: number;
}

export interface DigitParts {
  integer: string;
  fraction: string;
}

/**
 * Locales differ in how many integer digits a value needs before grouping starts
 * (hu-HU groups from five digits, en-US from four). The second probe carries one
 * digit more than a single group, so the presence of a separator reveals the rule.
 */
export function readLayout(
  formatter: Intl.NumberFormat,
  probe: number,
  groupingProbe: number,
): NumberLayout {
  const parts = formatter.formatToParts(probe);
  const integers = parts.filter((part) => part.type === "integer").map((part) => part.value);
  const groupSeparator = parts.find((part) => part.type === "group")?.value ?? "";
  const groupsEarly = formatter.formatToParts(groupingProbe).some((part) => part.type === "group");
  const minimumGroupingDigits = groupsEarly ? 1 : 2;

  if (integers.length < 2) {
    return { parts, groupSeparator, primaryGroupSize: 0, secondaryGroupSize: 0, minimumGroupingDigits };
  }

  return {
    parts,
    groupSeparator,
    primaryGroupSize: integers[integers.length - 1]?.length ?? 0,
    secondaryGroupSize: integers[integers.length - 2]?.length ?? 0,
    minimumGroupingDigits,
  };
}

export function splitDigits(fixedPoint: string): DigitParts {
  const separatorIndex = fixedPoint.indexOf(".");

  if (separatorIndex === -1) return { integer: fixedPoint, fraction: "" };

  return {
    integer: fixedPoint.slice(0, separatorIndex),
    fraction: fixedPoint.slice(separatorIndex + 1),
  };
}

export function trimTrailingZeros(fraction: string): string {
  let end = fraction.length;

  while (end > 0 && fraction[end - 1] === "0") end -= 1;

  return fraction.slice(0, end);
}

export function groupDigits(digits: string, layout: NumberLayout): string {
  const { groupSeparator, primaryGroupSize, secondaryGroupSize, minimumGroupingDigits } = layout;

  if (primaryGroupSize <= 0 || groupSeparator === "") return digits;
  if (digits.length < primaryGroupSize + minimumGroupingDigits) return digits;

  const size = secondaryGroupSize > 0 ? secondaryGroupSize : primaryGroupSize;
  const groups = [digits.slice(digits.length - primaryGroupSize)];
  let head = digits.slice(0, digits.length - primaryGroupSize);

  while (head.length > size) {
    groups.unshift(head.slice(head.length - size));
    head = head.slice(0, head.length - size);
  }

  groups.unshift(head);

  return groups.join(groupSeparator);
}

export function renderNumber(layout: NumberLayout, digits: DigitParts, signText?: string): string {
  const grouped = groupDigits(digits.integer, layout);
  let integerWritten = false;
  let rendered = "";

  for (const part of layout.parts) {
    if (part.type === "group") continue;

    if (part.type === "integer") {
      if (!integerWritten) {
        rendered += grouped;
        integerWritten = true;
      }
      continue;
    }

    if (part.type === "decimal") {
      if (digits.fraction !== "") rendered += part.value;
      continue;
    }

    if (part.type === "fraction") {
      rendered += digits.fraction;
      continue;
    }

    if (part.type === "minusSign" || part.type === "plusSign") {
      rendered += signText ?? part.value;
      continue;
    }

    rendered += part.value;
  }

  return rendered;
}
