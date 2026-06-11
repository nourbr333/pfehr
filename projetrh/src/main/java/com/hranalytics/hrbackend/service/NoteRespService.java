package com.hranalytics.hrbackend.service;



import com.hranalytics.hrbackend.dto.NoteRespCreateDTO;

import com.hranalytics.hrbackend.dto.NoteRespUpdateDTO;

import com.hranalytics.hrbackend.entity.AppUser;

import com.hranalytics.hrbackend.entity.Employee;

import com.hranalytics.hrbackend.entity.NoteResp;

import com.hranalytics.hrbackend.repository.AppUserRepository;

import com.hranalytics.hrbackend.repository.NoteRespRepository;

import com.hranalytics.hrbackend.security.AuthenticatedUser;

import com.hranalytics.hrbackend.security.SecurityUtils;

import org.springframework.http.HttpStatus;

import org.springframework.stereotype.Service;

import org.springframework.web.server.ResponseStatusException;



import java.time.LocalDateTime;

import java.util.ArrayList;

import java.util.LinkedHashSet;

import java.util.List;

import java.util.Set;



@Service

public class NoteRespService {



    private final NoteRespRepository noteRespRepository;

    private final AppUserRepository appUserRepository;



    public NoteRespService(NoteRespRepository noteRespRepository,

                           AppUserRepository appUserRepository) {

        this.noteRespRepository = noteRespRepository;

        this.appUserRepository = appUserRepository;

    }



    public List<NoteResp> getForAuthenticatedUser(AuthenticatedUser user) {

        Set<Long> seen = new LinkedHashSet<>();

        List<NoteResp> result = new ArrayList<>();



        if (user.getUserId() != null) {

            for (NoteResp note : noteRespRepository.findByUserIdOrderByCreatedAtDesc(user.getUserId())) {

                if (seen.add(note.getId())) {

                    result.add(note);

                }

            }

        }



        for (String email : resolveUserEmails(user)) {

            for (NoteResp note : noteRespRepository.findByUserEmailIgnoreCaseOrderByCreatedAtDesc(email)) {

                if (seen.add(note.getId())) {

                    result.add(note);

                }

            }

        }



        result.sort((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()));

        return result;

    }



    public NoteResp create(NoteRespCreateDTO dto, AuthenticatedUser user) {

        if (dto.getContent() == null || dto.getContent().isBlank()) {

            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le contenu ne peut pas être vide.");

        }



        String ownerEmail = resolvePrimaryEmail(user);



        NoteResp note = new NoteResp();

        note.setUserEmail(ownerEmail);

        note.setUserId(user.getUserId());



        note.setKpiKey(blankToNull(dto.getKpiKey()));

        note.setKpiLabel(blankToNull(dto.getKpiLabel()));

        note.setKpiValue(blankToNull(dto.getKpiValue()));

        note.setFilterScope(blankToNull(dto.getFilterScope()));

        note.setPeriodLabel(blankToNull(dto.getPeriodLabel()));

        note.setTitle(blankToNull(dto.getTitle()));

        note.setContent(dto.getContent().trim());



        LocalDateTime now = LocalDateTime.now();

        note.setCreatedAt(now);

        note.setUpdatedAt(now);



        return noteRespRepository.save(note);

    }



    @SuppressWarnings("null")
    public NoteResp update(Long id, NoteRespUpdateDTO dto, AuthenticatedUser user) {

        if (dto.getContent() == null || dto.getContent().isBlank()) {

            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le contenu ne peut pas être vide.");

        }



        NoteResp note = noteRespRepository.findById(id)

                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Note introuvable."));

        ensureOwner(note, user);



        note.setTitle(blankToNull(dto.getTitle()));

        note.setContent(dto.getContent().trim());

        note.setUpdatedAt(LocalDateTime.now());



        return noteRespRepository.save(note);

    }



    @SuppressWarnings("null")
    public void delete(Long id, AuthenticatedUser user) {

        NoteResp note = noteRespRepository.findById(id)

                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Note introuvable."));

        ensureOwner(note, user);

        noteRespRepository.deleteById(id);

    }



    private void ensureOwner(NoteResp note, AuthenticatedUser user) {

        if (SecurityUtils.isAdmin(user)) {

            return;

        }

        if (note.getUserId() != null && user.getUserId() != null && note.getUserId().equals(user.getUserId())) {

            return;

        }

        for (String email : resolveUserEmails(user)) {

            if (note.getUserEmail() != null && note.getUserEmail().equalsIgnoreCase(email)) {

                return;

            }

        }

        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Accès refusé à cette note.");

    }



    @SuppressWarnings("null")
    private Set<String> resolveUserEmails(AuthenticatedUser user) {

        Set<String> emails = new LinkedHashSet<>();

        if (user.getEmail() != null && !user.getEmail().isBlank()) {

            emails.add(user.getEmail().trim());

        }

        if (user.getUserId() != null) {

            appUserRepository.findById(user.getUserId()).ifPresent(appUser -> {

                String accountEmail = appUser.getEmail();

                if (accountEmail != null && !accountEmail.isBlank()) {

                    emails.add(accountEmail.trim());

                }

                Employee employee = appUser.getEmployee();

                if (employee != null && employee.getEmail() != null && !employee.getEmail().isBlank()) {

                    emails.add(employee.getEmail().trim());

                }

            });

        }

        return emails;

    }



    @SuppressWarnings("null")
    private String resolvePrimaryEmail(AuthenticatedUser user) {

        if (user.getUserId() != null) {

            return appUserRepository.findById(user.getUserId())

                    .map(this::resolveClientEmail)

                    .orElse(user.getEmail());

        }

        return user.getEmail();

    }



    private String resolveClientEmail(AppUser appUser) {

        Employee employee = appUser.getEmployee();

        if (employee != null && employee.getEmail() != null && !employee.getEmail().isBlank()) {

            return employee.getEmail().trim();

        }

        return appUser.getEmail();

    }



    private String blankToNull(String value) {

        return (value == null || value.isBlank()) ? null : value.trim();

    }

}


