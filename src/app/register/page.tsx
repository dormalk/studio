
import { RegisterClient } from "./RegisterClient";
import { getDivisions } from "@/actions/divisionActions";

export default async function RegisterPage() {
  const divisions = await getDivisions();
  return <RegisterClient divisions={divisions} />;
}
