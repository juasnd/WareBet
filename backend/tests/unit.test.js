const test=require('node:test');const assert=require('node:assert/strict');const {menus,permissions}=require('../src/config/permissions');const {fields}=require('../src/utils/sql');
test('el menú base no eleva privilegios del apostador',()=>{assert.deepEqual(menus.APOSTADOR,['dashboard','eventos','mis-apuestas','perfil']);assert.equal(permissions['usuarios:write'].includes('APOSTADOR'),false)});
test('el filtrado de campos excluye columnas desconocidas',()=>{assert.deepEqual(fields('eventos',{deporte:'Fútbol',sql:'DROP TABLE usuarios'}),{deporte:'Fútbol'})});
