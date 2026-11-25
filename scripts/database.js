import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
// Adaptador exclusivo de desenvolvimento/testes. Produção usa o binding D1 nativo.
export function database(path=':memory:'){
 const sqlite=new DatabaseSync(path);sqlite.exec('PRAGMA foreign_keys=ON;');
 sqlite.exec('CREATE TABLE IF NOT EXISTS _local_migrations(name TEXT PRIMARY KEY)');
 for(const file of readdirSync(resolve('migrations')).filter(n=>n.endsWith('.sql')).sort()){
  if(!sqlite.prepare('SELECT name FROM _local_migrations WHERE name=?').get(file)){sqlite.exec('BEGIN');try{sqlite.exec(readFileSync(resolve('migrations',file),'utf8'));sqlite.prepare('INSERT INTO _local_migrations VALUES (?)').run(file);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}}
 }
 function prepare(sql,args=[]){return {sql,args,bind(...values){return prepare(sql,values);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};}
 return {prepare,async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}},sqlite};
}
