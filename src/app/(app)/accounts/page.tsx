import { PreviewSwitch } from "@/components/screens/preview-switch";
import { AccountsEmpty, AccountsPopulated } from "@/components/screens/accounts-screen";

export default function AccountsPage() {
  return <PreviewSwitch populated={<AccountsPopulated />} empty={<AccountsEmpty />} />;
}
