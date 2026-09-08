import { render, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chartsMock = vi.hoisted(() => {
  const series = { setData: vi.fn(), applyOptions: vi.fn() };
  const timeScale = { fitContent: vi.fn() };
  const chart = {
    addSeries: vi.fn(() => series),
    applyOptions: vi.fn(),
    resize: vi.fn(),
    remove: vi.fn(),
    timeScale: vi.fn(() => timeScale),
  };

  return {
    series,
    chart,
    createChart: vi.fn(() => chart),
    AreaSeries: { type: "Area" },
    ColorType: { Solid: "solid" },
  };
});

const hooks = vi.hoisted(() => ({ useEquityChartData: vi.fn() }));

vi.mock("lightweight-charts", () => ({
  createChart: chartsMock.createChart,
  AreaSeries: chartsMock.AreaSeries,
  ColorType: chartsMock.ColorType,
}));

vi.mock("../hooks", () => hooks);

import { i18n } from "../../../i18n";
import { EquityChart } from "./EquityChart";

const SERIES = [
  { time: 1788877800, value: 100000 },
  { time: 1788877860, value: 100250.5 },
];

function renderChart() {
  return render(
    <I18nextProvider i18n={i18n}>
      <EquityChart range="1D" />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.classList.remove("dark");
  hooks.useEquityChartData.mockReturnValue({ series: SERIES, isEmpty: false, isLoading: false });
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

describe("EquityChart", () => {
  it("creates the chart once and pushes the mapped series", () => {
    renderChart();

    expect(chartsMock.createChart).toHaveBeenCalledTimes(1);
    expect(chartsMock.chart.addSeries).toHaveBeenCalledWith(chartsMock.AreaSeries, expect.any(Object));
    expect(chartsMock.series.setData).toHaveBeenCalledWith(SERIES);
  });

  it("re-applies the chart options when the dark class is toggled", async () => {
    renderChart();

    const before = chartsMock.chart.applyOptions.mock.calls.length;
    document.documentElement.classList.add("dark");

    await waitFor(() => {
      expect(chartsMock.chart.applyOptions.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it("renders the empty state instead of the chart when the range has no points", () => {
    hooks.useEquityChartData.mockReturnValue({ series: [], isEmpty: true, isLoading: false });

    const { getByText } = renderChart();

    expect(getByText(i18n.t("dashboard:equityChart.empty"))).toBeInTheDocument();
  });
});
