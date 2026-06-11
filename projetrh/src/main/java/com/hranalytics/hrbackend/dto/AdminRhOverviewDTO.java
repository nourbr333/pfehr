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
        List<MonthlyCount> demandesCongesParMois,
        List<RhMovement> derniersMouvements) {

    public record MonthlyCount(String mois, long total) {}

    public record RhMovement(
            String employe,
            String type,
            String statut,
            String dateDebut,
            String dateFin,
            String demandeLe) {}
}
