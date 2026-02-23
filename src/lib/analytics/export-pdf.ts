import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type KeyValue = {
	label: string;
	value: string;
};

type ThroughputPoint = {
	label: string;
	count: number;
};

type ScopePoint = {
	label: string;
	created: number;
	completed: number;
	net: number;
};

type RiskProject = {
	name: string;
	status: string;
	healthLabel: string;
	variance: number;
	dueLabel: string;
};

type HealthProjectRow = {
	name: string;
	status: string;
	progress: number;
	schedule: number;
	variance: number;
	issueCount: number;
	dueLabel: string;
	healthLabel: string;
};

export type AnalyticsPdfExportInput = {
	workspaceName: string;
	workspaceSlug: string;
	rangeLabel: string;
	projectFilter: string;
	memberFilter: string;
	generatedAt: string;
	kpis: KeyValue[];
	throughputSeries: ThroughputPoint[];
	scopeSeries: ScopePoint[];
	workTypeMix: {
		bug: number;
		improvement: number;
		feature: number;
		issue: number;
		total: number;
	};
	riskProjects: RiskProject[];
	healthRows: HealthProjectRow[];
};

function statusLabel(status: string): string {
	if (status === "in_progress") return "In progress";
	if (status === "in_review") return "In review";
	if (status === "todo") return "Todo";
	if (status === "backlog") return "Backlog";
	if (status === "triage") return "Triage";
	if (status === "done") return "Done";
	if (status === "cancelled") return "Cancelled";
	if (status === "active") return "Active";
	if (status === "planned") return "Planned";
	if (status === "completed") return "Completed";
	return status;
}

export function exportAnalyticsPdf(input: AnalyticsPdfExportInput) {
	const doc = new jsPDF({ unit: "pt", format: "a4" });
	const margin = 40;
	const pageWidth = doc.internal.pageSize.getWidth();

	doc.setFont("helvetica", "bold");
	doc.setFontSize(16);
	doc.text(`Analytics Report - ${input.workspaceName}`, margin, 44);

	doc.setFont("helvetica", "normal");
	doc.setFontSize(10);
	doc.text(`Workspace: ${input.workspaceSlug}`, margin, 62);
	doc.text(`Range: ${input.rangeLabel}`, margin, 76);
	doc.text(`Project filter: ${input.projectFilter}`, margin, 90);
	doc.text(`Member filter: ${input.memberFilter}`, margin, 104);
	doc.text(`Generated: ${input.generatedAt}`, margin, 118);

	autoTable(doc, {
		startY: 136,
		theme: "grid",
		head: [["Metric", "Value"]],
		body: input.kpis.map((kpi) => [kpi.label, kpi.value]),
		headStyles: { fillColor: [37, 99, 235] },
		styles: { fontSize: 9 },
	});

	const afterKpiY =
		(((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
			?.finalY ?? 136) as number) + 16;

	doc.setFont("helvetica", "bold");
	doc.setFontSize(12);
	doc.text("Work type mix", margin, afterKpiY);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(10);
	doc.text(
		`Bug: ${input.workTypeMix.bug} | Improvement: ${input.workTypeMix.improvement} | Feature: ${input.workTypeMix.feature} | Issue: ${input.workTypeMix.issue} | Total: ${input.workTypeMix.total}`,
		margin,
		afterKpiY + 14,
		{ maxWidth: pageWidth - margin * 2 },
	);

	autoTable(doc, {
		startY: afterKpiY + 28,
		theme: "striped",
		head: [["Period", "Created", "Completed", "Net"]],
		body:
			input.scopeSeries.length > 0
				? input.scopeSeries.map((point) => [
						point.label,
						String(point.created),
						String(point.completed),
						point.net > 0 ? `+${point.net}` : String(point.net),
					])
				: [["No scope data", "-", "-", "-"]],
		headStyles: { fillColor: [15, 118, 110] },
		styles: { fontSize: 9 },
	});

	autoTable(doc, {
		startY:
			(((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
				?.finalY ?? afterKpiY + 90) as number) + 14,
		theme: "striped",
		head: [["Period", "Completed issues"]],
		body:
			input.throughputSeries.length > 0
				? input.throughputSeries.map((point) => [
						point.label,
						String(point.count),
					])
				: [["No throughput data", "0"]],
		headStyles: { fillColor: [79, 70, 229] },
		styles: { fontSize: 9 },
	});

	doc.addPage();

	doc.setFont("helvetica", "bold");
	doc.setFontSize(12);
	doc.text("Projects at risk", margin, 40);

	autoTable(doc, {
		startY: 52,
		theme: "striped",
		head: [["Project", "Status", "Health", "Variance", "Due"]],
		body:
			input.riskProjects.length > 0
				? input.riskProjects.map((project) => [
						project.name,
						statusLabel(project.status),
						project.healthLabel,
						`${project.variance > 0 ? "+" : ""}${project.variance}%`,
						project.dueLabel,
					])
				: [["No at-risk projects", "-", "-", "-", "-"]],
		headStyles: { fillColor: [190, 24, 93] },
		styles: { fontSize: 9 },
	});

	autoTable(doc, {
		startY:
			(((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
				?.finalY ?? 120) as number) + 16,
		theme: "grid",
		head: [
			[
				"Project",
				"Status",
				"Progress",
				"Schedule",
				"Variance",
				"Issues",
				"Due",
				"Health",
			],
		],
		body:
			input.healthRows.length > 0
				? input.healthRows.map((project) => [
						project.name,
						statusLabel(project.status),
						`${project.progress}%`,
						`${project.schedule}%`,
						`${project.variance > 0 ? "+" : ""}${project.variance}%`,
						String(project.issueCount),
						project.dueLabel,
						project.healthLabel,
					])
				: [["No projects", "-", "-", "-", "-", "-", "-", "-"]],
		headStyles: { fillColor: [3, 105, 161] },
		styles: { fontSize: 8 },
		columnStyles: {
			0: { cellWidth: 130 },
			6: { cellWidth: 70 },
		},
	});

	const isoDate = new Date().toISOString().slice(0, 10);
	doc.save(`analytics-${input.workspaceSlug}-${isoDate}.pdf`);
}
