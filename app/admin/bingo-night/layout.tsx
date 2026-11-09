import { AdminGate } from "@/components/admin/AdminGate";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminGate permission="host_bingo_night">{children}</AdminGate>;
}
