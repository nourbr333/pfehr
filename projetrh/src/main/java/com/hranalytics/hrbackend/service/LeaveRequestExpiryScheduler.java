package com.hranalytics.hrbackend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Tâche planifiée qui marque comme 'expired' (arrivé à échéance)
 * toutes les demandes de congé encore en statut 'pending' dont la date de fin
 * est dépassée sans réponse du responsable RH.
 *
 * Exécution : au démarrage de l'application (rattrapage immédiat) +
 *             tous les jours à 00:05 (heure serveur).
 */
@Component
public class LeaveRequestExpiryScheduler {

    private static final Logger log = LoggerFactory.getLogger(LeaveRequestExpiryScheduler.class);

    private final LeaveRequestService leaveRequestService;

    public LeaveRequestExpiryScheduler(LeaveRequestService leaveRequestService) {
        this.leaveRequestService = leaveRequestService;
    }

    /**
     * Rattrapage au démarrage — utile en développement ou après un arrêt serveur
     * pendant la nuit où le cron aurait dû s'exécuter.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void expireOnStartup() {
        expireOverduePendingRequests();
    }

    /**
     * Cron : 0 5 0 * * * → 00:05 chaque jour.
     */
    @Scheduled(cron = "0 5 0 * * *")
    public void expireOverduePendingRequests() {
        try {
            int expired = leaveRequestService.expirePendingRequests();
            if (expired > 0) {
                log.info("[LeaveExpiry] {} demande(s) marquée(s) 'expired' (arrivée à échéance).", expired);
            }
        } catch (Exception e) {
            log.error("[LeaveExpiry] Erreur lors de l'expiration des demandes de congé.", e);
        }
    }
}
