import {sha256Text, validateMigrationManifest} from '../app/application/local-commerce-migration-ledger.ts';

export const literal = value => "'" + String(value).replaceAll("'", "''") + "'";

// Only reviewed SQL is accepted. Original bytes remain checksum authority;
// the generated wrapper is local CLI input, never a replacement source migration.
export function ledgerWrappers(manifest, sources, projectId, markerDigest) {
  if (validateMigrationManifest(manifest).status !== 'valid' ||
      !/^figmemento-local-commerce-test-run-[a-z0-9]{8,32}$/.test(projectId) ||
      !/^[a-f0-9]{64}$/.test(markerDigest)) throw Error('Invalid disposable ledger identity');
  return manifest.migrations.map((entry, index) => {
    const sql=sources[index];
    if(typeof sql!=='string' || sha256Text(sql)!==entry.checksum) throw Error('Source checksum mismatch');
    // 0007 has a reviewed outer transaction; move its commit after ledger write.
    const body=entry.version===7 ? sql.replace(/^begin;\s*$/mi,'').replace(/^commit;\s*$/mi,'') : sql;
    if (/^\s*(?:commit|rollback|begin)\s*;/mi.test(body) || /^\s*\\/m.test(body)) throw Error('Unsupported transaction control');
    const prior=manifest.migrations.slice(0,index).map(m=>`(${m.version},${literal(m.migrationId)},${literal(m.checksum)},${literal(projectId)})`).join(',');
    const guard=index===0
      ? "if to_regnamespace('local_commerce') is not null then raise exception 'fresh schema required'; end if;"
      : `if (select count(*) from local_commerce.migration_ledger) <> ${index} or exists (
          select version,migration_id,checksum,project_id from local_commerce.migration_ledger
          except values ${prior}) then raise exception 'ledger mismatch'; end if;`;
    const markerGuard=index>1 ? `if not exists(select 1 from local_commerce.project_identities where project_id=${literal(projectId)} and marker_digest=${literal(markerDigest)} and project_kind='disposable_test' and environment='test' and lifecycle='active') then raise exception 'marker mismatch'; end if;` : '';
    const init=index===1 ? `insert into local_commerce.project_identities(project_id,environment,project_kind,schema_version,marker_digest) values(${literal(projectId)},'test','disposable_test',2,${literal(markerDigest)});` : '';
    return `-- Generated disposable wrapper; source SHA256 ${entry.checksum}\nbegin;\nselect pg_advisory_xact_lock(7141001);\ndo $gate$ begin ${guard} ${markerGuard} end $gate$;\n${body}\n${init}\ninsert into local_commerce.migration_ledger(version,migration_id,filename,checksum,project_id,schema_version,rollback_guidance,forward_fix_guidance) values(${entry.version},${literal(entry.migrationId)},${literal(entry.filename)},${literal(entry.checksum)},${literal(projectId)},${manifest.schemaVersion},${literal(entry.rollback)},${literal(entry.forwardFix)});\n${index>=1 ? `update local_commerce.project_identities set schema_version=${entry.version} where project_id=${literal(projectId)};` : ''}\ncommit;\n`;
  });
}
