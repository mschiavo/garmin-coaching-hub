# ADR V4.1 — Ownership, allowlist e sicurezza Planning/Goals

**Stato: PROPOSTO — approvazione necessaria prima di migration/RPC.**

## Fatti

`dashboard_private.allowed_users` collega user UUID ad `auth.users`; `dashboard_data()` e `dashboard_private.check_v2()` autorizzano `auth.uid()` presente in allowlist. RPC V2 sono SECURITY DEFINER con `search_path=''`, execute a authenticated, non PUBLIC/anon; schemi/tabelle non direttamente leggibili. Archivio senza `athlete_id`/`owner_user_id`: account autorizzati vedono archivio condiviso, non identifica proprietario atleta.

## A — Per installazione (raccomandata MVP personale)

Piani/goal condivisi da tutti gli allowlisted, come archivio. Ogni RPC verifica auth.uid + allowlist; non si inventa user-as-athlete. Pro: allineato a Community Edition personale, schema semplice, nessuna falsa separazione. Contro: ogni allowlisted può leggere/scrivere tutto; revoca nega accesso ma non cancella dati; delete Auth rimuove membership, non piano installazione.

RLS defense-in-depth, grant tabellari minimi; definer valida identità e scope a ogni operazione. Test: due utenti allowlisted condividono (comportamento deliberate), anon/non-allowlisted/revoked negati, direct-schema denied, cambio account invalida cache, delete Auth non cancella piani.

## B — Per utente allowlisted

`owner_user_id` su ogni piano/goal/sessione. Pro: separa account. Contro: archivio Garmin resta condiviso e senza ownership atleta; il prodotto può associare un piano all'atleta sbagliato e simulare privacy non presente. Revoca/delete richiede transfer/retention/orphan rules. RLS e ogni RPC definer devono controllare owner per risorsa, join, ID, cursor e link. Test incrociati 2 identity su CRUD, UUID enumeration, attività comuni, revoca, deletion, cursor/cache e risposte tardive.

## C — Installazione ora, atleta esplicito poi

Partire per installazione e introdurre entità atleta solo con requisito e data source che rendano verificabile la separazione. Migrazione futura, più onesta che trattare auth UUID come athlete ID.

## Raccomandazione

Adottare A nell'MVP personale, dichiarando condivisione tra allowlisted; non aggiungere ownership utente finché archivio non è partizionato realmente. Coerente con `V4_PRODUCT_SPEC_v1_1.md` (SaaS multi-atleta fuori scope) e ADR-003. È proposta, non approvazione: product owner e security devono decidere.

## Invarianti richieste

1. Auth valida ≠ autorizzazione; utente non allowlisted non legge/scrive.
2. Nuove tabelle non accessibili direttamente; grant RPC minimi.
3. Definer usa search_path vuoto, nomi qualificati, revoke PUBLIC/anon, grant authenticated, verifica allowlist e scope/owner.
4. RLS come difesa; niente BYPASSRLS o disattivazioni opportunistiche.
5. Errori non rivelano se UUID esiste; cache identity/revision e abort cambio sessione.
6. Revoca/delete/cascade espliciti, nessuna cancellazione automatica storica.
7. Writer Garmin senza grant Planning; nessuna RPC altera raw Garmin.

**Gate:** approvare A/B o altro confine atleta prima di persistenza.
