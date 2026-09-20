/**
 * Senha inicial do ambiente academico.
 *
 * Usada EXCLUSIVAMENTE no provisionamento: o seed deriva o hash scrypt e
 * grava so o hash. Ela nunca e enviada ao navegador, nunca aparece em tela
 * e nunca e gravada em claro no banco.
 *
 * `WMS_SEED_PASSWORD` tem precedencia, para que um ambiente real possa
 * provisionar com outra senha sem tocar no codigo.
 *
 * Isto e adequado a uma simulacao academica com senha compartilhada e
 * combinada entre a equipe. Um sistema de producao nao teria senha inicial
 * em codigo: cada pessoa definiria a sua no primeiro acesso.
 */
export const INITIAL_PASSWORD = process.env.WMS_SEED_PASSWORD ?? "Projetolog122";
