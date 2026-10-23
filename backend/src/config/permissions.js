const menus = {
  ADMIN: ['dashboard','usuarios','eventos','apuestas','reportes'],
  GESTOR: ['dashboard','eventos','apuestas','reportes'],
  APOSTADOR: ['dashboard','eventos','mis-apuestas','perfil']
};
const permissions = {
  'usuarios:read': ['ADMIN'], 'usuarios:write': ['ADMIN'], 'eventos:read': ['ADMIN','GESTOR','APOSTADOR'],
  'eventos:write': ['ADMIN','GESTOR'], 'apuestas:read': ['ADMIN','GESTOR','APOSTADOR'], 'apuestas:self': ['APOSTADOR'],
  'apuestas:write': ['ADMIN','APOSTADOR'], 'reportes:read': ['ADMIN','GESTOR']
};
module.exports = { menus, permissions };
