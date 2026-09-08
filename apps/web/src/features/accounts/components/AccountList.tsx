import { useState } from "react";

import { useAccounts } from "../hooks";
import { AccountRow } from "./AccountRow";
import { RenameAccountDialog } from "./RenameAccountDialog";

export function AccountList() {
  const { accounts, activeAccountId, setActiveAccount } = useAccounts();
  const [collapsedIds, setCollapsedIds] = useState<readonly string[]>([]);
  const [renameId, setRenameId] = useState<string | null>(null);

  const toggle = (accountId: string): void => {
    setCollapsedIds((previous) =>
      previous.includes(accountId)
        ? previous.filter((id) => id !== accountId)
        : [...previous, accountId],
    );
  };

  const renameTarget = accounts.find((account) => account.id === renameId) ?? null;

  return (
    <>
      <ul className="flex flex-col gap-1">
        {accounts.map((account) => (
          <AccountRow
            account={account}
            active={account.id === activeAccountId}
            expanded={!collapsedIds.includes(account.id)}
            key={account.id}
            onRename={setRenameId}
            onSelect={setActiveAccount}
            onToggle={toggle}
          />
        ))}
      </ul>
      <RenameAccountDialog
        accountId={renameId}
        currentName={renameTarget?.name ?? ""}
        onOpenChange={(open) => {
          if (!open) setRenameId(null);
        }}
      />
    </>
  );
}
