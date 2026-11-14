import React from 'react';

export function TeamAuthorityRoster({
  members = [],
  leaderId = '',
  currentActorId = '',
  openSpots = 0,
  previewCount = 0,
  onClaimLead,
  canClaimLead = false
}) {
  const isMemberLead = m =>
    Boolean(
      m &&
        (m.role === 'lead' ||
          m.isLead ||
          m.isLeader ||
          (leaderId && (m.userId === leaderId || m.id === leaderId || m.handle === leaderId)))
    );

  const getHandle = m => m?.handle || m?.userId || m?.id || 'member';

  const leadMember = members.find(isMemberLead) || null;
  const regularMembers = members.filter(m => m !== leadMember);
  const leadHandle = leadMember ? getHandle(leadMember) : '';
  const leadIsSelf = Boolean(leadMember && currentActorId && leadHandle === currentActorId);

  return (
    <div className="team-authority-roster" role="list" aria-label="Team leadership and members">
      {leadMember ? (
        <span
          role="listitem"
          className="roster-role-pill"
          data-firefly-state="lead-present"
          data-purpose-anchor="team-lead"
        >
          <span className="firefly-pip" aria-hidden="true" />
          <strong>{leadHandle}</strong>
          <span className="roster-role-tag" aria-label="Team Lead">
            {leadIsSelf ? '★ Lead · You' : '★ Lead'}
          </span>
        </span>
      ) : (
        <span
          role="listitem"
          className="roster-role-pill"
          data-firefly-state="lead-missing"
          data-purpose-anchor="team-lead-vacant"
        >
          <span className="firefly-pip" aria-hidden="true" />
          <span>◇ No Lead · Open Helm</span>
          {canClaimLead && onClaimLead && (
            <button
              type="button"
              className="claim-helm-inline-btn"
              onClick={onClaimLead}
            >
              Claim Lead
            </button>
          )}
        </span>
      )}

      {regularMembers.map(mem => {
        const handle = getHandle(mem);
        const isSelf = Boolean(currentActorId && handle === currentActorId);
        return (
          <span
            key={handle}
            role="listitem"
            className="roster-role-pill"
            data-firefly-state="member"
          >
            <span aria-hidden="true">○</span>
            <strong>{handle}</strong>
            <span className="roster-role-tag">{isSelf ? 'Member · You' : 'Member'}</span>
          </span>
        );
      })}

      {openSpots > 0 && (
        <span
          role="listitem"
          className="roster-role-pill"
          data-firefly-state="open-spots"
          title="Open server spots ready for invite or join"
        >
          <span aria-hidden="true">◌</span>
          <span>
            +{openSpots} open {openSpots === 1 ? 'spot' : 'spots'}
          </span>
        </span>
      )}

      {!leadMember && openSpots === 0 && previewCount > 0 && (
        <span
          role="listitem"
          className="roster-role-pill"
          data-firefly-state="open-spots"
          title="People currently in your unconfirmed local plan preview"
        >
          <span aria-hidden="true">◌</span>
          <span>{previewCount} in local preview</span>
        </span>
      )}
    </div>
  );
}

export default TeamAuthorityRoster;
