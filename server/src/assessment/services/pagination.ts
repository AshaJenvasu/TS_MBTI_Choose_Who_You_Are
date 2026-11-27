/**
 * Result history paging (GET /results). The only place these numbers live:
 * the query schema, the OpenAPI doc and the service all read them from here.
 */

/** Fixed by the server: the client cannot ask for more rows per page (OWASP API4). */
export const PAGE_SIZE = 10;

/**
 * Highest page a client may ask for (PAGE_SIZE × MAX_PAGE = 10,000 results deep).
 * Caps the OFFSET, so a huge `page` cannot become a deep scan or overflow the
 * bigint OFFSET in Postgres (a 500); anything above is a 400 INVALID_PAGE instead.
 */
export const MAX_PAGE = 1000;
