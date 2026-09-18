import React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import PurchaseOrdersListPage from "@/app/(app)/finance/transactions/purchase_order/page"
import CanteenPcvListPage from "@/app/(app)/finance/canteen-pcv/page"
import PaymentsCashReceipt from "@/components/ui/finance/transactions/payments-cash-receipt/payments-cash-receipt"
import ChequeVoucherEntryPage from "@/app/(app)/finance/transactions/cheque_voucher_entry/page"
import StudentAccountsListPage from "@/app/(app)/finance/transactions/student_acc/page"
import SundryAccountListPage from "@/app/(app)/finance/transactions/sundry_acc/page"
import PurchaseRequisitionPage from "@/app/(app)/finance/transactions/purchase_requisition/page"
import PurchaseOrderReceivingPage from "@/app/(app)/finance/transactions/purchase_order_receiving/page"
import AccountsPayablePage from "@/app/(app)/finance/transactions/due_purchase_order_payables/page"
import JournalVoucherEntryPage from "@/app/(app)/finance/transactions/journal_voucher_entry/page"
import PettyCashEntryPage from "@/app/(app)/finance/transactions/petty_cash_entry/page"

export const finance_transactions = ({
  initialSubTab,
  initialStudentName,
}: {
  initialSubTab?: string
  initialStudentName?: string
} = {}) => {
  return (
    <Tabs defaultValue={initialSubTab ?? "student-accounts"} orientation="vertical" className="flex-row items-stretch bg-card p-4 rounded-lg shadow-md w-full h-[85vh]">
      {/* TabsList's own base styling (ui/tabs.tsx) hard-codes h-fit for
          vertical orientation via group-data-vertical/tabs:h-fit — no
          className passed here can reliably win that cascade (same-specificity
          utility classes, unpredictable source order). Rather than fight it,
          this wrapper div owns the actual height bound + scrolling, and
          TabsList is left free to size to its natural (possibly taller)
          content inside it. */}
      <div className="w-70 shrink-0 min-h-0 overflow-y-auto mr-7">
        <TabsList className="grid grid-cols-1 content-start gap-5 border-0 bg-card w-full">
            <TabsTrigger value="student-accounts" className="w-full gap-2 p-3 border-border data-active:bg-primary data-active:text-primary-foreground">
                Student Accounts
            </TabsTrigger>
            <TabsTrigger value="sundry-accounts" className="w-full gap-2 p-3 border-border data-active:bg-primary data-active:text-primary-foreground">
                Sundry Accounts
            </TabsTrigger>
            <TabsTrigger value="purchase-requisition" className="w-full gap-2 p-3 border-border data-active:bg-primary data-active:text-primary-foreground">
                Purchase Requisition
            </TabsTrigger>
            <TabsTrigger value="purchase-orders" className="w-full gap-2 p-3 border-border data-active:bg-primary data-active:text-primary-foreground">
                Purchase Orders
            </TabsTrigger>
            <TabsTrigger value="purchase-orders-receiving" className="w-full gap-2 p-3 border-border data-active:bg-primary data-active:text-primary-foreground">
                Purchase Orders Receiving
            </TabsTrigger>
            <TabsTrigger value="due-purchase-order-payable" className="w-full gap-2 p-3 border-border data-active:bg-primary data-active:text-primary-foreground">
                Due Purchase Order Payable
            </TabsTrigger>
            <div className="border-t border-border my-1" />
            <TabsTrigger value="payments-cash-receipt-entry" className="w-full gap-2 p-3 border-border data-active:bg-primary data-active:text-primary-foreground">
                Payments / Cash Receipt Entry
            </TabsTrigger>
            <TabsTrigger value="cheque-voucher-entry" className="w-full gap-2 p-3 border-border data-active:bg-primary data-active:text-primary-foreground">
                Cheque Voucher Entry
            </TabsTrigger>
            <TabsTrigger value="journal-voucher-entry" className="w-full gap-2 p-3 border-border data-active:bg-primary data-active:text-primary-foreground">
                Journal Voucher Entry
            </TabsTrigger>
            <TabsTrigger value="petty-cash-voucher-entry" className="w-full gap-2 p-3 border-border data-active:bg-primary data-active:text-primary-foreground">
                Petty Cash Voucher Entry
            </TabsTrigger>
            <TabsTrigger value="petty-cash-voucher-canteen-entry" className="w-full gap-2 p-3 border-border data-active:bg-primary data-active:text-primary-foreground">
                Petty Cash Voucher Canteen Entry
            </TabsTrigger>
        </TabsList>
      </div>
        <TabsContent value="student-accounts" className="mt-0 min-w-0 flex-1">
          <div className="tabContent h-full! min-w-0 max-w-full rounded-md border-border">
            <StudentAccountsListPage />
          </div>
        </TabsContent>
        <TabsContent value="sundry-accounts" className="mt-0 min-w-0 flex-1">
          <div className="tabContent h-full! min-w-0 max-w-full rounded-md border-border">
            <SundryAccountListPage />
          </div>
        </TabsContent>
        <TabsContent value="purchase-requisition" className="mt-0 min-w-0 flex-1 overflow-y-auto">
          <div className="tabContent h-full! min-w-0 max-w-full rounded-md border-border">
            <PurchaseRequisitionPage />
          </div>
        </TabsContent>
        <TabsContent value="purchase-orders" className="mt-0 min-w-0 flex-1 overflow-y-auto">
          <div className="tabContent h-full! min-w-0 max-w-full rounded-md border-border">
            <PurchaseOrdersListPage />
          </div>
        </TabsContent>
        <TabsContent value="purchase-orders-receiving" className="mt-0 min-w-0 flex-1">
          <div className="tabContent h-full! min-w-0 max-w-full rounded-md border-border">
            <PurchaseOrderReceivingPage />
          </div>
        </TabsContent>
        <TabsContent value="due-purchase-order-payable" className="mt-0 min-w-0 flex-1">
          <div className="tabContent h-full! min-w-0 max-w-full rounded-md border-border">
            <AccountsPayablePage />
          </div>
        </TabsContent>
        <TabsContent value="payments-cash-receipt-entry" className="mt-0 min-w-0 flex-1 overflow-y-auto">
          <div className="tabContent h-full! min-w-0 max-w-full rounded-md border-border">
            <PaymentsCashReceipt initialStudentName={initialStudentName} />
          </div>
        </TabsContent>
        <TabsContent value="cheque-voucher-entry" className="mt-0 min-w-0 flex-1">
          <div className="tabContent h-full! min-w-0 max-w-full rounded-md border-border">
            <ChequeVoucherEntryPage />
          </div>
        </TabsContent>
        <TabsContent value="journal-voucher-entry" className="mt-0 min-w-0 flex-1">
          <div className="tabContent h-full! min-w-0 max-w-full rounded-md border-border">
            <JournalVoucherEntryPage />
          </div>
        </TabsContent>
        <TabsContent value="petty-cash-voucher-entry" className="mt-0 min-w-0 flex-1">
          <div className="tabContent h-full! min-w-0 max-w-full rounded-md border-border">
            <PettyCashEntryPage />
          </div>
        </TabsContent>
        <TabsContent value="petty-cash-voucher-canteen-entry" className="mt-0 min-w-0 flex-1 overflow-y-auto">
          <div className="tabContent h-full! min-w-0 max-w-full rounded-md border-border">
            <CanteenPcvListPage />
          </div>
        </TabsContent>
    </Tabs>
  )
}

export default finance_transactions
