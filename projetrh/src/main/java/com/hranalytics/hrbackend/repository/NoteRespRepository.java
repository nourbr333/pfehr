package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.NoteResp;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NoteRespRepository extends JpaRepository<NoteResp, Long> {

    /** Toutes les notes d'un utilisateur, triées de la plus récente à la plus ancienne. */
    List<NoteResp> findByUserEmailIgnoreCaseOrderByCreatedAtDesc(String userEmail);

    List<NoteResp> findByUserIdOrderByCreatedAtDesc(Long userId);
}
