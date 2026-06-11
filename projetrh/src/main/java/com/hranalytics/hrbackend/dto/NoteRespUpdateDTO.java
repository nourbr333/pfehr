package com.hranalytics.hrbackend.dto;

public class NoteRespUpdateDTO {

    /** Titre mis à jour — null ou blanc efface le titre existant. */
    private String title;

    /** Nouveau contenu (obligatoire, non vide). */
    private String content;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}
