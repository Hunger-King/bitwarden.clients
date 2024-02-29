import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";
import { CollectionAccessDetailsResponse } from "@bitwarden/common/src/vault/models/response/collection.response";
import { CollectionView } from "@bitwarden/common/vault/models/view/collection.view";

import { CollectionAccessSelectionView } from "../../../admin-console/organizations/core/views/collection-access-selection.view";

export class CollectionAdminView extends CollectionView {
  groups: CollectionAccessSelectionView[] = [];
  users: CollectionAccessSelectionView[] = [];
  addAccess: boolean;

  /**
   * Flag indicating the user has been explicitly assigned to this Collection
   */
  assigned: boolean;

  constructor(response?: CollectionAccessDetailsResponse) {
    super(response);

    if (!response) {
      return;
    }

    this.groups = response.groups
      ? response.groups.map((g) => new CollectionAccessSelectionView(g))
      : [];

    this.users = response.users
      ? response.users.map((g) => new CollectionAccessSelectionView(g))
      : [];

    this.assigned = response.assigned;
  }

  get allGroups() {
    return this.groups;
  }

  get allUsers() {
    return this.users;
  }

  override canEdit(org: Organization): boolean {
    return org?.flexibleCollections
      ? org?.canEditAnyCollection || this.manage
      : org?.canEditAnyCollection || (org?.canEditAssignedCollections && this.assigned);
  }

  override canDelete(org: Organization): boolean {
    return org?.flexibleCollections
      ? org?.canDeleteAnyCollection || (!org?.limitCollectionCreationDeletion && this.manage)
      : org?.canDeleteAnyCollection || (org?.canDeleteAssignedCollections && this.assigned);
  }
}
