import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {loadZip} from '../backend/src/parser.js';
import {save} from '../backend/src/storage.js';
const file=process.argv[2];if(!file)throw new Error('Usage: npm run import -- "path/to/scripts.zip"');
const ds=loadZip(await readFile(file),path.basename(file,'.zip'));await save(`data/datasets/${ds.id}.json`,ds);console.log(JSON.stringify({id:ds.id,name:ds.name,report:{...ds.report,warnings:ds.report.warnings.length,manualReviewFiles:ds.report.manualReviewFiles.length}},null,2));
