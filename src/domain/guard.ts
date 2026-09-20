import { redirect } from "next/navigation";
import { currentProfile } from "@/domain/context";
import type { Profile } from "@/domain/auth";

/**
 * Porteiro dos layouts autenticados.
 *
 * Complementa — nao substitui — a exigencia de sessao em currentOperator():
 * este redireciona quem navega sem sessao para o login, enquanto aquele
 * barra o POST direto numa server action, que nao passa por layout nenhum.
 */
export async function requireProfile(): Promise<Profile> {
  const perfil = await currentProfile();
  if (!perfil) redirect("/login");
  return perfil;
}
