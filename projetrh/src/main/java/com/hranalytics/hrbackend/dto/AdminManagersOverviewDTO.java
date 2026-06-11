package com.hranalytics.hrbackend.dto;

import java.util.List;

/** Récapitulatif de l'activité des managers pour la supervision admin (Vue Managers). */
public record AdminManagersOverviewDTO(
        long totalManagers,
        long managersAvecCompteActif,
        double avancementOkrMoyen,
        long objectifsEnRisque,
        long absencesEnAttenteTotal,
        long evaluationsAnnee,
        List<ManagerRow> managers) {

    public record ManagerRow(
            Integer employeeId,
            String nom,
            String departement,
            boolean compteActif,
            long tailleEquipe,
            long objectifs,
            double avancementMoyen,
            long objectifsEnRisque,
            long evaluationsAnnee,
            long absencesEnAttente) {}
}
