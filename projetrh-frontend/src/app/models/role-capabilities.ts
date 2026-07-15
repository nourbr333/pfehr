/**
 * Documente dans le code l'héritage de rôles matérialisé dans le diagramme de cas
 * d'utilisation UML du rapport PFE : l'Admin hérite des acteurs Responsable RH et Manager,
 * c'est-à-dire qu'il peut réaliser toutes leurs actions.
 *
 * Côté implémentation, il n'existe pas de table de permissions dynamique (hors scope PFE) :
 * l'héritage est matérialisé par role string ('ADMIN' traité comme superuser) côté backend
 * (voir `SecurityUtils.isAdmin()`) et par l'inclusion de 'ADMIN' dans les rôles autorisés
 * des routes RH/Manager côté frontend (`app.routes.ts`).
 *
 * Ce fichier ne pilote aucune logique d'autorisation : il sert de référence documentée
 * pour les onglets « actions héritées » embarqués dans Vue Responsables et Vue Managers.
 */

export type BaseRole = 'RESPONSABLE_RH' | 'MANAGER';

export const ROLE_INHERITS: Record<'ADMIN', readonly BaseRole[]> = {
  ADMIN: ['RESPONSABLE_RH', 'MANAGER']
};

export interface RoleCapability {
  key: string;
  label: string;
  /** Onglet / zone de l'admin où l'action est exposée. */
  embeddedIn: string;
}

/** Actions du rôle Responsable RH exposées dans l'onglet « Actions RH » de Vue Responsables. */
export const RH_CAPABILITIES: RoleCapability[] = [
  { key: 'leave.approve', label: 'Approuver / refuser une demande de congé', embeddedIn: 'Vue Responsables — Congés' },
  { key: 'leave.balance.adjust', label: 'Ajuster un solde de congés', embeddedIn: 'Vue Responsables — Congés' },
  { key: 'leave.create', label: 'Créer une demande de congé', embeddedIn: 'Vue Responsables — Congés' },
  { key: 'employees.crud', label: 'Modifier / supprimer un collaborateur', embeddedIn: 'Vue Responsables — Effectif' },
  { key: 'evaluations.read', label: 'Consulter les évaluations de l\u2019entreprise', embeddedIn: 'Vue Responsables — Performances' }
];

/**
 * Actions du rôle Manager exposées dans le panel « Gérer » de Vue Managers.
 *
 * Note : pour les objectifs et les évaluations, l'admin ne peut pas *créer* (ces actions
 * restent réservées au manager depuis son propre portail) ; il peut seulement modifier
 * l'avancement / le contenu ou supprimer un élément existant.
 */
export const MANAGER_CAPABILITIES: RoleCapability[] = [
  { key: 'team.manage', label: 'Retirer un collaborateur de l\u2019équipe / inviter un collaborateur', embeddedIn: 'Vue Managers — Équipe' },
  { key: 'objectifs.update-delete', label: 'Mettre à jour l\u2019avancement d\u2019un objectif / supprimer un objectif existant', embeddedIn: 'Vue Managers — Objectifs' },
  { key: 'absences.manage', label: 'Suggérer une alternative / créer un plan de continuité', embeddedIn: 'Vue Managers — Absences' },
  { key: 'evaluations.update-delete', label: 'Modifier / supprimer une évaluation existante', embeddedIn: 'Vue Managers — Évaluations' }
];
