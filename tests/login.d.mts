/** Tipos do helper de login compartilhado pelas suites de navegador e pelo
 *  gerador de PDFs. O helper e .mjs porque roda fora do pipeline do Next. */
export declare const USUARIO_PADRAO: string;
export declare const SENHA_PADRAO: string;
export declare function entrar(
  page: any, base: string, email?: string, senha?: string,
): Promise<void>;
