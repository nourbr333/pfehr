package com.hranalytics.hrbackend.dto;

import java.util.List;

/** Récapitulatif de l'activité RH pour la supervision admin (Vue Responsables). */
public record AdminRhOverviewDTO(
        long effectifTotal,
        long embauches30Jours,
        long congesEnAttente,
        long congesApprouvesAnnee,
        long congesRefusesAnnee,
        double tauxPresence30Jours,
        long evaluationsAnnee,
        long seuilsKpiConfigures,
        long departementsCount,
        long soldesEnAlerte,
        List<MonthlyCount> demandesCongesParMois,
        List<RhMovement> derniersMouvements,
        List<RecentEvaluation> evaluationsRecentes) {

    public record MonthlyCount(String mois, long total) {}

    /** id est l'identifiant de la demande de congé (leave_requests.id) — nécessaire pour les actions admin. */
    public record RhMovement(
            Integer id,
            String employe,
            String type,
            String statut,
            String dateDebut,
            String dateFin,
            String demandeLe) {}

    public record RecentEvaluation(
            String employe,
            String departement,
            String manager,
            String periode,
            Integer note,
            String evalueLe) {}
}
