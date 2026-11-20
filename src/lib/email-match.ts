/**
 * Email matching for the "Forgot password" forms.
 *
 * Both forms only send a reset when the typed email matches the one on
 * file. An exact match missed reps who type a Gmail-style "+tag" address
 * (sherrellrdg+hogansmith@gmail.com for sherrellrdg@gmail.com) or different
 * capitals, and because the forms never say whether an email matched, the
 * reset just silently never arrived.
 *
 * Matching ignores case and any "+tag" in the part before "@". The reset
 * link is still sent only to the address on file, so this can't redirect
 * mail anywhere new.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().replace(/\+[^@]*@/, "@");
}

/**
 * SQL that normalizes an email column the same way as normalizeEmail().
 * `column` must be a trusted, hard-coded column reference, never user input.
 */
export function normalizedEmailSql(column: string): string {
  return `lower(regexp_replace(trim(${column}), '[+][^@]*@', '@'))`;
}
