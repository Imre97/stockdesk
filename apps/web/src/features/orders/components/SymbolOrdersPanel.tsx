import { useSymbolOrdersPanel } from "../page-hooks";
import { CancelOrderDialog } from "./CancelOrderDialog";
import { ModifyOrderDialog } from "./ModifyOrderDialog";
import { OrderDetailsDrawer } from "./OrderDetailsDrawer";
import { OrdersTable } from "./OrdersTable";

export interface SymbolOrdersPanelProps {
  symbol: string;
}

export function SymbolOrdersPanel({ symbol }: SymbolOrdersPanelProps) {
  const { table, dialogs } = useSymbolOrdersPanel(symbol);

  return (
    <div className="flex flex-col gap-2">
      <OrdersTable
        onCancel={dialogs.openCancel}
        onDetails={dialogs.openDetails}
        onModify={dialogs.openModify}
        view={table}
      />
      <ModifyOrderDialog view={dialogs.modify} />
      <CancelOrderDialog view={dialogs.cancel} />
      <OrderDetailsDrawer view={dialogs.details} />
    </div>
  );
}
